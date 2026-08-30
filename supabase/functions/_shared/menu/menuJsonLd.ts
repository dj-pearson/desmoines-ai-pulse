/**
 * schema.org menu extraction from JSON-LD.
 *
 * WHY THIS RUNS FIRST
 * -------------------
 * A large share of restaurant sites already publish their menu as structured
 * data, because the platforms that build those sites emit it for Google's rich
 * results: BentoBox, Popmenu, Toast and most WordPress restaurant themes ship
 * `Restaurant.hasMenu` / `Menu.hasMenuSection` / `MenuItem.offers.price`
 * out of the box.
 *
 * When it is there it is *exact* — real section names, real prices, no
 * truncation, no hallucination — and it costs one regex plus a JSON.parse
 * instead of a Claude call. The previous scraper never looked at it and sent
 * every one of those sites through flattened-text LLM extraction instead.
 *
 * The parallel `jsonLdEvents.ts` does the same job for schema.org/Event; this
 * is deliberately a separate module because the node shapes share nothing.
 *
 * Note: microdata (`itemtype="http://schema.org/Menu"`) is NOT handled here.
 * It is vanishingly rare for menus compared to JSON-LD, and the DOM-shape
 * heuristics in `menuContent.ts` cover the same sites more reliably.
 */

import type { MenuExtraction, MenuItem, MenuSection } from "./types.ts";

/** Result of a JSON-LD pass: menu data, plus URLs that point at more menus. */
export interface JsonLdMenuResult {
  extraction: MenuExtraction | null;
  /**
   * `hasMenu` values that were a bare URL rather than an inline Menu object.
   * These are high-confidence menu locations — feed them to discovery.
   */
  menuUrls: string[];
}

/** schema.org diet URIs → the tag vocabulary the database stores. */
const DIET_MAP: Record<string, string> = {
  vegandiet: "vegan",
  vegetariandiet: "vegetarian",
  glutenfreediet: "gluten-free",
  lowlactosediet: "dairy-free",
  halaldiet: "halal",
  kosherdiet: "kosher",
};

type JsonValue = unknown;

/** Extract the raw text of every ld+json script block on the page. */
export function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script\b[^>]*type\s*=\s*["']application\/(?:ld\+json|json)["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const body = match[1].trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

/** Decode the handful of entities that show up inside script bodies. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parse a JSON-LD block, retrying once with common breakage repaired.
 *
 * Real pages ship JSON-LD with trailing commas, CDATA wrappers and raw
 * newlines inside strings often enough that a single strict parse loses menus
 * that are otherwise perfectly readable.
 */
function parseBlock(raw: string): JsonValue | null {
  const cleaned = raw
    .replace(/^\s*<!\[CDATA\[/, "")
    .replace(/\]\]>\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }
  try {
    return JSON.parse(decodeEntities(cleaned).replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

/** True when `node`'s `@type` includes `type` (case-insensitive). */
function hasType(node: Record<string, JsonValue>, ...types: string[]): boolean {
  const raw = node["@type"] ?? node["type"];
  const values = Array.isArray(raw) ? raw : [raw];
  const wanted = types.map((t) => t.toLowerCase());
  return values.some(
    (v) => typeof v === "string" && wanted.includes(v.split("/").pop()!.toLowerCase()),
  );
}

/** Depth-first walk over every object in a parsed JSON-LD document. */
function* walkNodes(value: JsonValue, depth = 0): Generator<Record<string, JsonValue>> {
  if (depth > 12 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) yield* walkNodes(entry, depth + 1);
    return;
  }
  const node = value as Record<string, JsonValue>;
  yield node;
  for (const child of Object.values(node)) yield* walkNodes(child, depth + 1);
}

function firstString(value: JsonValue): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const node = value as Record<string, JsonValue>;
    // Language-tagged values: {"@value": "Nachos", "@language": "en"}
    if (typeof node["@value"] === "string") return node["@value"].trim() || null;
  }
  return null;
}

function toArray(value: JsonValue): JsonValue[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Pull a displayed price out of a MenuItem's `offers`.
 *
 * Handles `offers.price`, `offers[].price`, and
 * `offers.priceSpecification.price`, with the currency symbol restored so the
 * stored `price` text matches what a diner would see.
 */
function extractPrice(node: Record<string, JsonValue>): string | null {
  for (const offer of toArray(node.offers)) {
    if (!offer || typeof offer !== "object") {
      const direct = firstString(offer);
      if (direct) return formatPrice(direct, null);
      continue;
    }
    const offerNode = offer as Record<string, JsonValue>;
    const currency = firstString(offerNode.priceCurrency);
    const direct = firstString(offerNode.price);
    if (direct) return formatPrice(direct, currency);

    for (const spec of toArray(offerNode.priceSpecification)) {
      if (!spec || typeof spec !== "object") continue;
      const specNode = spec as Record<string, JsonValue>;
      const specPrice = firstString(specNode.price);
      if (specPrice) {
        return formatPrice(specPrice, firstString(specNode.priceCurrency) ?? currency);
      }
    }
  }
  return null;
}

function formatPrice(value: string, currency: string | null): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^[^\d]/.test(text)) return text; // already carries a symbol or is "Market"
  if (!currency || currency.toUpperCase() === "USD") return `$${text}`;
  return `${text} ${currency.toUpperCase()}`;
}

function extractDietaryTags(node: Record<string, JsonValue>): string[] {
  const tags = new Set<string>();
  for (const diet of toArray(node.suitableForDiet)) {
    const value = firstString(diet) ?? firstString((diet as Record<string, JsonValue>)?.["@id"]);
    if (!value) continue;
    const key = value.split(/[/#]/).pop()!.toLowerCase();
    const mapped = DIET_MAP[key];
    if (mapped) tags.add(mapped);
  }
  return [...tags].sort();
}

function toMenuItem(node: Record<string, JsonValue>): MenuItem | null {
  const name = firstString(node.name);
  if (!name) return null;
  const price = extractPrice(node);
  return {
    item_name: name,
    item_description: firstString(node.description),
    price,
    // Left to normalizeExtraction, which owns numeric parsing for every path.
    price_numeric: null,
    dietary_tags: extractDietaryTags(node),
    is_popular: false,
  };
}

/**
 * Flatten a Menu or MenuSection into sections.
 *
 * schema.org allows sections to nest arbitrarily ("Drinks" → "Beer" → "IPA").
 * The database model is one level deep, so nested names are joined with " — "
 * to keep the grouping legible rather than collapsing it away.
 */
function collectSections(
  node: Record<string, JsonValue>,
  inheritedName: string | null,
  sections: MenuSection[],
  depth = 0,
): void {
  if (depth > 5) return;

  const ownName = firstString(node.name);
  // Only MenuSection names compose. A Menu's own name is the menu's title
  // ("Dinner", "Drinks"), not a prefix for every section inside it — carrying
  // it down produces "Drinks — Beer — On Tap" where the section is "Beer — On Tap".
  const name = hasType(node, "MenuSection")
    ? inheritedName && ownName
      ? `${inheritedName} — ${ownName}`
      : ownName ?? inheritedName
    : inheritedName;

  const directItems: MenuItem[] = [];
  for (const raw of toArray(node.hasMenuItem)) {
    if (!raw || typeof raw !== "object") continue;
    const item = toMenuItem(raw as Record<string, JsonValue>);
    if (item) directItems.push(item);
  }

  if (directItems.length > 0) {
    sections.push({
      // Items hanging directly off an unnamed Menu still deserve its title.
      section_name: name ?? ownName ?? "Main Menu",
      section_sort_order: sections.length,
      items: directItems,
    });
  }

  for (const raw of toArray(node.hasMenuSection)) {
    if (!raw || typeof raw !== "object") continue;
    collectSections(raw as Record<string, JsonValue>, name, sections, depth + 1);
  }
}

/**
 * Read every schema.org Menu on the page.
 *
 * Returns both the menu itself and any `hasMenu` URLs, because a site that
 * declares `"hasMenu": "https://example.com/menu.pdf"` has just told us
 * exactly where its menu lives — worth more than any link-text heuristic.
 */
export function extractMenuFromJsonLd(html: string, pageUrl: string): JsonLdMenuResult {
  const sections: MenuSection[] = [];
  const menuUrls = new Set<string>();
  const seenSections = new Set<string>();

  for (const block of extractJsonLdBlocks(html)) {
    const parsed = parseBlock(block);
    if (!parsed) continue;

    for (const node of walkNodes(parsed)) {
      // A Restaurant/FoodEstablishment pointing at its menu.
      if (hasType(node, "Restaurant", "FoodEstablishment", "BarOrPub", "CafeOrCoffeeShop", "Brewery")) {
        for (const raw of toArray(node.hasMenu ?? node.menu)) {
          const asUrl = typeof raw === "string" ? raw : null;
          if (asUrl) {
            const resolved = resolve(asUrl, pageUrl);
            if (resolved) menuUrls.add(resolved);
            continue;
          }
          if (raw && typeof raw === "object") {
            const menuNode = raw as Record<string, JsonValue>;
            const url = firstString(menuNode.url);
            if (url) {
              const resolved = resolve(url, pageUrl);
              if (resolved) menuUrls.add(resolved);
            }
          }
        }
      }

      if (!hasType(node, "Menu")) continue;

      const url = firstString(node.url);
      if (url) {
        const resolved = resolve(url, pageUrl);
        if (resolved) menuUrls.add(resolved);
      }

      const collected: MenuSection[] = [];
      collectSections(node, null, collected);

      // The same Menu object frequently appears in more than one block (page
      // JSON-LD plus a plugin's copy). Deduplicate on section identity.
      for (const section of collected) {
        const key = `${section.section_name}::${section.items.map((i) => i.item_name).join("|")}`;
        if (seenSections.has(key)) continue;
        seenSections.add(key);
        sections.push({ ...section, section_sort_order: sections.length });
      }
    }
  }

  const extraction: MenuExtraction | null =
    sections.length > 0
      ? {
          sections,
          method: "jsonld",
          source_url: pageUrl,
          raw_text: `[schema.org Menu from ${pageUrl}]`,
        }
      : null;

  return { extraction, menuUrls: [...menuUrls] };
}

function resolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
