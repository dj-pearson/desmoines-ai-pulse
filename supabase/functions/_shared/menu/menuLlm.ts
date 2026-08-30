/**
 * Claude-backed menu extraction: prompts, schema-constrained output, chunking
 * and JSON recovery.
 *
 * THREE RELIABILITY PROBLEMS THIS ADDRESSES
 * -----------------------------------------
 * 1. FREE-TEXT JSON. The old calls asked for "ONLY a JSON object" and then
 *    regex-hunted for `{...}` in the reply, with a bespoke brace-balancing
 *    repair for when it went wrong. Every extraction path had its own copy.
 *    Here the model is given a tool with an input schema and told to call it,
 *    so the API itself guarantees the shape. The text path and the repair are
 *    kept as fallbacks, because an endpoint override in `ai_config` could point
 *    somewhere that does not support tool use.
 *
 * 2. SILENT TRUNCATION. A 90-item menu does not fit in one `max_tokens`
 *    response. The old code noticed (`stop_reason === 'max_tokens'`), logged a
 *    warning, salvaged whatever parsed, and published the partial menu as if it
 *    were complete. Long inputs are now split at line boundaries and extracted
 *    per chunk, then merged, so the tail of a big menu is read rather than
 *    guessed at.
 *
 * 3. TRANSIENT FAILURES. A 429 or 529 killed the whole restaurant. Requests now
 *    retry with backoff.
 */

import { fetchWithTimeout } from "../fetchWithTimeout.ts";
import { getAIConfig } from "../aiConfig.ts";
import { DIETARY_TAGS } from "./types.ts";
import type { MenuExtraction, MenuSection } from "./types.ts";
import { mergeExtractions } from "./menuNormalize.ts";
import { parseMenuJson, sectionsOf } from "./menuJson.ts";
import { chunkMenuText } from "./menuContent.ts";

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;

// ─── Prompt ─────────────────────────────────────────────────────────────────

/**
 * Shared extraction rules. Kept in one place because the text, PDF and image
 * paths previously carried three drifting copies of near-identical wording.
 */
export const MENU_EXTRACTION_RULES = `Extract EVERY item, not just highlights or featured dishes.

- item_name: the dish or drink name exactly as written.
- item_description: the description if one is shown, otherwise omit.
- price: exactly as displayed — "$12.99", "$10/$15", "Market Price". Omit if no price is shown.
- price_numeric: the numeric value; for a range or multiple sizes use the LOWEST. Omit when there is no number.
- dietary_tags: only from the allowed list. Read menu shorthand: (GF) gluten-free, (V) vegetarian, (VG)/(VE) vegan, (DF) dairy-free.
- is_popular: true only when the menu marks it — star, flame, "fan favorite", "chef's pick".

Group items under the menu's OWN section headings ("Tacos", "On Tap", "From the Griddle"). Only fall back to "Main Menu" when the menu genuinely has no headings. Number sections from 0 in reading order.

Ignore navigation links, hours, addresses, phone numbers, social media and marketing copy — those are not menu items. If the content contains no menu at all, return an empty sections array rather than inventing items.`;

/** Tool definition that constrains the reply to the menu shape. */
function menuTool() {
  return {
    name: "record_menu",
    description: "Record the complete menu extracted from the provided content.",
    input_schema: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          description: "Menu sections in reading order.",
          items: {
            type: "object",
            properties: {
              section_name: { type: "string" },
              section_sort_order: { type: "integer" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    item_name: { type: "string" },
                    item_description: { type: "string" },
                    price: { type: "string" },
                    price_numeric: { type: "number" },
                    dietary_tags: {
                      type: "array",
                      items: { type: "string", enum: [...DIETARY_TAGS] },
                    },
                    is_popular: { type: "boolean" },
                  },
                  required: ["item_name"],
                },
              },
            },
            required: ["section_name", "items"],
          },
        },
      },
      required: ["sections"],
    },
  };
}

// ─── API call ───────────────────────────────────────────────────────────────

export interface MenuLlmContext {
  supabaseUrl: string;
  supabaseKey: string;
  apiKey: string;
}

type ContentBlock = Record<string, unknown>;

/**
 * One Claude request, returning sections or null.
 *
 * Retries 429/5xx with linear backoff. A refusal or an empty reply is not
 * retried — it will not become a different answer.
 */
async function requestMenu(
  ctx: MenuLlmContext,
  content: ContentBlock[],
  label: string,
): Promise<MenuSection[] | null> {
  const config = await getAIConfig(ctx.supabaseUrl, ctx.supabaseKey);
  const maxTokens = Number.parseInt(String(config.max_tokens_large), 10) || 8000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        config.api_endpoint,
        {
          method: "POST",
          headers: {
            "x-api-key": ctx.apiKey,
            "anthropic-version": config.anthropic_version,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: config.default_model,
            max_tokens: maxTokens,
            temperature: 0,
            tools: [menuTool()],
            tool_choice: { type: "tool", name: "record_menu" },
            messages: [{ role: "user", content }],
          }),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (error) {
      console.error(`  ❌ ${label}: request failed — ${(error as Error).message}`);
      if (attempt === MAX_ATTEMPTS) return null;
      await delay(attempt * 2000);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const detail = await response.text().catch(() => "");
      console.warn(`  ⏳ ${label}: ${response.status}, retry ${attempt}/${MAX_ATTEMPTS} — ${detail.slice(0, 200)}`);
      if (attempt === MAX_ATTEMPTS) return null;
      await delay(attempt * 3000);
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`  ❌ ${label}: Claude API ${response.status} — ${detail.slice(0, 400)}`);
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data) return null;

    const blocks: Array<Record<string, unknown>> = Array.isArray(data.content) ? data.content : [];

    // Preferred path: the tool call, whose shape the API validated.
    for (const block of blocks) {
      if (block.type === "tool_use" && block.name === "record_menu") {
        const sections = sectionsOf(block.input);
        if (sections) return sections;
      }
    }

    // Fallback: an endpoint that ignored `tools` and replied with prose.
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");

    if (data.stop_reason === "max_tokens") {
      console.warn(`  ⚠️ ${label}: reply hit max_tokens — recovering what parsed`);
    }
    if (!text) {
      console.warn(`  ⚠️ ${label}: empty reply (stop_reason=${data.stop_reason})`);
      return null;
    }
    return parseMenuJson(text);
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public extractors ──────────────────────────────────────────────────────

/** Extract a menu from prepared page text. */
export async function extractMenuFromText(
  ctx: MenuLlmContext,
  content: string,
  restaurantName: string,
  sourceUrl: string,
): Promise<MenuExtraction | null> {
  const chunks = chunkMenuText(content);
  let combined: MenuExtraction | null = null;

  for (const [index, chunk] of chunks.entries()) {
    const part = chunks.length > 1 ? ` (part ${index + 1} of ${chunks.length})` : "";
    const sections = await requestMenu(
      ctx,
      [
        {
          type: "text",
          text: `You are extracting the menu for the restaurant "${restaurantName}" from its website (${sourceUrl})${part}.

${MENU_EXTRACTION_RULES}

The content below was converted from HTML. Each line is one element of the page; a price on the same line as a name belongs to that item.

--- PAGE CONTENT ---
${chunk}
--- END PAGE CONTENT ---`,
        },
      ],
      `text${part}`,
    );

    if (!sections || sections.length === 0) continue;
    const extraction: MenuExtraction = {
      sections,
      method: "html_text",
      source_url: sourceUrl,
      raw_text: chunk.slice(0, 50_000),
    };
    // Chunks share a source_url, so merging keeps `html_text` rather than
    // relabelling a single page's extraction as "merged".
    combined = combined ? mergeExtractions(combined, extraction) : extraction;
  }

  return combined;
}

/** Extract a menu from a PDF via Claude's document support. */
export async function extractMenuFromPdf(
  ctx: MenuLlmContext,
  pdfBase64: string,
  restaurantName: string,
  sourceUrl: string,
): Promise<MenuExtraction | null> {
  const sections = await requestMenu(
    ctx,
    [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      },
      {
        type: "text",
        text: `This PDF is a menu from "${restaurantName}" (${sourceUrl}). Read every page.

${MENU_EXTRACTION_RULES}`,
      },
    ],
    "pdf",
  );

  if (!sections || sections.length === 0) return null;
  return {
    sections,
    method: "pdf_vision",
    source_url: sourceUrl,
    raw_text: `[PDF menu from ${sourceUrl}]`,
  };
}

export interface VisionImage {
  base64: string;
  mediaType: string;
}

/**
 * Extract a menu from photographs or graphics of it.
 *
 * All pages go in one request so the model can see that image 2 continues the
 * section image 1 started, rather than inventing a new section per file.
 */
export async function extractMenuFromImages(
  ctx: MenuLlmContext,
  images: VisionImage[],
  restaurantName: string,
  sourceUrl: string,
): Promise<MenuExtraction | null> {
  if (images.length === 0) return null;
  const used = images.slice(0, 8);

  const content: ContentBlock[] = used.map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.base64 },
  }));

  content.push({
    type: "text",
    text: `${used.length > 1 ? `These ${used.length} images are` : "This image is"} the menu of "${restaurantName}" (${sourceUrl}). They may be consecutive pages of one menu — read them together and do not repeat an item that appears twice.

${MENU_EXTRACTION_RULES}

If an image is a photo of food, a logo, or anything other than a menu, ignore it entirely.`,
  });

  const sections = await requestMenu(ctx, content, `images(${used.length})`);
  if (!sections || sections.length === 0) return null;

  return {
    sections,
    method: "image_vision",
    source_url: sourceUrl,
    raw_text: `[${used.length} menu image(s) from ${sourceUrl}]`,
  };
}
