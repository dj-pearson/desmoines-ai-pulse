/**
 * Menu-platform fingerprinting and embedded-state extraction.
 *
 * THE PROBLEM
 * -----------
 * Independent restaurants almost never hand-write their menu into HTML. They
 * use a platform, and most of those platforms render the menu client-side from
 * a JSON blob. Server-fetched HTML therefore contains the *data* but not the
 * rendered text, so the old scraper — which flattened tags with
 * `replace(/<[^>]+>/g, ' ')` and handed the result to Claude — saw an empty
 * shell and reported "no menu content found".
 *
 * Worse, its link scorer gave third-party platform links a +7 bonus, so it
 * actively steered itself toward the pages it was least able to read.
 *
 * WHAT THIS DOES
 * --------------
 * 1. `detectMenuPlatform` names the platform from markup fingerprints, so the
 *    orchestrator knows whether a page needs JS rendering at all.
 * 2. `extractMenuFromEmbeddedState` finds the platform's own JSON payload in
 *    the HTML and reads the menu straight out of it — exact prices, exact
 *    section names, no LLM call.
 *
 * Everything is defensive: an unrecognised shape returns null and the caller
 * falls through to the vision/text tiers. A platform changing its payload
 * degrades this module to "no faster path available", never to a crash.
 */

import type { MenuExtraction, MenuItem, MenuSection } from "./types.ts";

/** Platforms we can recognise. `null` means "ordinary site". */
export type MenuPlatform =
  | "toast"
  | "popmenu"
  | "bentobox"
  | "square"
  | "clover"
  | "chownow"
  | "olo"
  | "slice"
  | "spoton"
  | "menufy"
  | "doordash"
  | "grubhub"
  | "ubereats"
  | "squarespace"
  | "wix"
  | "wordpress"
  | "untappd";

export interface PlatformInfo {
  platform: MenuPlatform | null;
  /**
   * True when the menu is rendered client-side, so a plain `fetch` will not
   * see it and the page must go through a JS-rendering backend.
   */
  requiresJs: boolean;
}

/**
 * Host fragments that identify a platform from a URL alone.
 *
 * Ordering matters only in that the first match wins; the fragments are
 * distinct enough that overlap is not a concern.
 */
const HOST_FINGERPRINTS: ReadonlyArray<[MenuPlatform, RegExp]> = [
  ["toast", /(?:^|\.)toasttab\.com$|(?:^|\.)toastenterprise\.com$/i],
  ["popmenu", /(?:^|\.)popmenu\.com$/i],
  ["bentobox", /(?:^|\.)getbento\.com$|(?:^|\.)bentobox\w*\.com$/i],
  ["square", /(?:^|\.)square\.site$|(?:^|\.)squareup\.com$/i],
  ["clover", /(?:^|\.)clover\.com$/i],
  ["chownow", /(?:^|\.)chownow\.com$/i],
  ["olo", /(?:^|\.)olo\.com$|(?:^|\.)ololabs\.com$/i],
  ["slice", /(?:^|\.)slicelife\.com$/i],
  ["spoton", /(?:^|\.)spoton\.com$|(?:^|\.)spotonbio\.com$/i],
  ["menufy", /(?:^|\.)menufy\.com$/i],
  ["doordash", /(?:^|\.)doordash\.com$/i],
  ["grubhub", /(?:^|\.)grubhub\.com$/i],
  ["ubereats", /(?:^|\.)ubereats\.com$/i],
  ["untappd", /(?:^|\.)untappd\.com$/i],
];

/** Markup fingerprints for platforms served from the restaurant's own domain. */
const MARKUP_FINGERPRINTS: ReadonlyArray<[MenuPlatform, RegExp]> = [
  ["popmenu", /popmenu\.(?:com|io)|window\.PopmenuConfig|data-popmenu/i],
  ["bentobox", /getbento\.com|bentobox-|data-bento/i],
  ["toast", /toasttab\.com|toast-embed|data-toast-/i],
  ["chownow", /chownow\.com|chownow-embed/i],
  ["olo", /olo\.com\/embed|data-olo-/i],
  ["square", /square\.site|squareup\.com\/embed|square-online/i],
  ["untappd", /untappd\.com\/embed|utfd\.io/i],
  ["squarespace", /Static\.SQUARESPACE_CONTEXT|squarespace-cdn\.com|squarespace\.com/i],
  ["wix", /wix\.com|wixstatic\.com|_wixCssIdFor|window\.wixPerformanceMeasurements/i],
  ["wordpress", /wp-content\/|wp-includes\/|wp-json/i],
];

/**
 * Platforms whose menu markup is not present in server-rendered HTML.
 *
 * Squarespace and WordPress are absent on purpose: both usually server-render
 * their menu blocks, so forcing every Squarespace site through a headless
 * browser would multiply cost for no gain. Wix is included because its pages
 * are near-empty without JS.
 */
const JS_RENDERED: ReadonlySet<MenuPlatform> = new Set<MenuPlatform>([
  "toast",
  "popmenu",
  "square",
  "clover",
  "chownow",
  "olo",
  "slice",
  "spoton",
  "menufy",
  "doordash",
  "grubhub",
  "ubereats",
  "wix",
  "untappd",
]);

/** Identify the platform behind a URL and/or its HTML. */
export function detectMenuPlatform(url: string, html?: string): PlatformInfo {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }

  for (const [platform, re] of HOST_FINGERPRINTS) {
    if (re.test(host)) return { platform, requiresJs: JS_RENDERED.has(platform) };
  }

  if (html) {
    // Only inspect the head-ish prefix: platform markers live in <head> or
    // early <script> tags, and scanning a 3 MB page body finds false matches
    // in user content ("we're on DoorDash!").
    const prefix = html.slice(0, 200_000);
    for (const [platform, re] of MARKUP_FINGERPRINTS) {
      if (re.test(prefix)) return { platform, requiresJs: JS_RENDERED.has(platform) };
    }
  }

  return { platform: null, requiresJs: false };
}

/**
 * True when a page fetched without JS looks like an empty app shell.
 *
 * Used to decide whether to spend a headless-browser render on a page whose
 * platform we did not recognise. The signal is markup that is large relative
 * to the visible text it produces, plus no prices anywhere.
 */
export function looksClientRendered(html: string, text: string): boolean {
  if (html.length < 2_000) return false;
  const priceCount = (text.match(/\$\s?\d/g) || []).length;
  if (priceCount >= 3) return false;
  const ratio = text.length / html.length;
  return ratio < 0.06 || text.length < 600;
}

// ─── Embedded state extraction ──────────────────────────────────────────────

type JsonValue = unknown;

/**
 * JSON payloads that modern frameworks inline into the page.
 *
 * The capture group must be the JSON value itself. Each is tried in order and
 * the first one that yields menu items wins.
 */
const STATE_PATTERNS: ReadonlyArray<RegExp> = [
  // Next.js (Toast, ChowNow, many custom builds)
  /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  // Nuxt
  /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
  // Generic redux/apollo preloads
  /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
  /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
  /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
  // Popmenu
  /window\.PopmenuConfig\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
  // BentoBox
  /window\.__BENTO_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
  // Squarespace page context (carries JSON blocks for some menu plugins)
  /Static\.SQUARESPACE_CONTEXT\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/i,
];

/** Keys under which platforms store a section's item list. */
const ITEM_LIST_KEYS = [
  "items",
  "menuItems",
  "menu_items",
  "products",
  "dishes",
  "entries",
  "children",
];

/** Keys under which platforms store a menu's section list. */
const SECTION_LIST_KEYS = [
  "sections",
  "menuSections",
  "menu_sections",
  "groups",
  "menuGroups",
  "categories",
  "menuCategories",
];

const NAME_KEYS = ["name", "title", "itemName", "displayName", "label"];
const DESCRIPTION_KEYS = ["description", "desc", "subtitle", "shortDescription", "caption"];
const PRICE_KEYS = ["price", "basePrice", "displayPrice", "amount", "priceText", "unitPrice"];

function firstStringField(node: Record<string, JsonValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    // Money objects: {amount: 1299, currency: "USD"} or {value: "12.99"}
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const money = value as Record<string, JsonValue>;
      const inner = money.amount ?? money.value ?? money.displayValue;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
      if (typeof inner === "number" && Number.isFinite(inner)) return String(inner);
    }
  }
  return null;
}

/**
 * Render a platform price field as displayed text.
 *
 * Platforms are split roughly evenly between decimal dollars (12.99) and
 * integer cents (1299). Treating cents as dollars would publish a $1,299
 * burrito, so an integer with no decimal point that is large enough to be
 * implausible as dollars is divided by 100.
 */
function formatPlatformPrice(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (!text) return null;
  if (/[^\d.]/.test(text)) return text.slice(0, 60); // already formatted

  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  if (Number.isInteger(value) && !text.includes(".") && value >= 100) {
    return `$${(value / 100).toFixed(2)}`;
  }
  return `$${value.toFixed(2)}`;
}

/** Does this object look like a single orderable item? */
function looksLikeItem(node: Record<string, JsonValue>): boolean {
  const name = firstStringField(node, NAME_KEYS);
  if (!name || name.length > 120) return false;
  const hasPrice = PRICE_KEYS.some((k) => node[k] !== undefined && node[k] !== null);
  const hasDescription = DESCRIPTION_KEYS.some((k) => typeof node[k] === "string");
  // A name alone is not enough — every nav entry has one.
  return hasPrice || hasDescription;
}

function toItem(node: Record<string, JsonValue>): MenuItem | null {
  const name = firstStringField(node, NAME_KEYS);
  if (!name) return null;
  return {
    item_name: name,
    item_description: firstStringField(node, DESCRIPTION_KEYS),
    price: formatPlatformPrice(firstStringField(node, PRICE_KEYS)),
    price_numeric: null, // normalizeExtraction owns numeric parsing
    dietary_tags: [],
    is_popular: node.popular === true || node.isPopular === true || node.featured === true,
  };
}

function arrayField(node: Record<string, JsonValue>, keys: string[]): JsonValue[] | null {
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return null;
}

/**
 * Walk any parsed JSON looking for section-shaped nodes: an object with a name
 * and an array of item-shaped children.
 *
 * Structure-driven rather than platform-specific on purpose — it recognises
 * Toast, ChowNow, Square and half a dozen bespoke builds without needing a
 * hand-written adapter for each, and keeps working when one of them renames a
 * wrapper key.
 */
function collectSections(
  value: JsonValue,
  sections: MenuSection[],
  seen: Set<string>,
  depth = 0,
): void {
  if (depth > 14 || value === null || typeof value !== "object") return;
  if (sections.length >= 60) return;

  if (Array.isArray(value)) {
    for (const entry of value) collectSections(entry, sections, seen, depth + 1);
    return;
  }

  const node = value as Record<string, JsonValue>;
  const itemsRaw = arrayField(node, ITEM_LIST_KEYS);

  if (itemsRaw) {
    const itemNodes = itemsRaw.filter(
      (i): i is Record<string, JsonValue> =>
        !!i && typeof i === "object" && !Array.isArray(i) && looksLikeItem(i as Record<string, JsonValue>),
    );

    // Require a couple of real items so a "children: [{name, description}]"
    // accordion of FAQ entries is not mistaken for a menu section.
    if (itemNodes.length >= 2) {
      const items = itemNodes.map(toItem).filter((i): i is MenuItem => i !== null);
      const name = firstStringField(node, NAME_KEYS) ?? "Main Menu";
      const key = `${name}::${items.map((i) => i.item_name).join("|")}`;
      if (items.length >= 2 && !seen.has(key)) {
        seen.add(key);
        sections.push({
          section_name: name,
          section_sort_order: sections.length,
          items,
        });
      }
    }
  }

  // Recurse regardless: a menu node holds sections which hold items, and the
  // section list may sit beside the item list rather than under it.
  const sectionsRaw = arrayField(node, SECTION_LIST_KEYS);
  if (sectionsRaw) {
    for (const entry of sectionsRaw) collectSections(entry, sections, seen, depth + 1);
  }

  for (const [key, child] of Object.entries(node)) {
    if (ITEM_LIST_KEYS.includes(key)) continue; // already consumed above
    collectSections(child, sections, seen, depth + 1);
  }
}

/**
 * Balanced-brace scan from `start`, so a JSON object containing `</script>`
 * inside a string is not truncated by the pattern's lazy match.
 */
function sliceBalancedObject(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract a menu from a platform's inlined JSON state.
 *
 * Returns null when nothing menu-shaped is found, which is the common case on
 * ordinary sites — callers should treat that as "try the next tier", not as an
 * error.
 */
export function extractMenuFromEmbeddedState(
  html: string,
  pageUrl: string,
): MenuExtraction | null {
  const sections: MenuSection[] = [];
  const seen = new Set<string>();

  for (const pattern of STATE_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;

    // Re-slice with brace balancing; the pattern only locates the start.
    const rawStart = html.indexOf("{", match.index);
    const raw =
      rawStart >= 0 ? sliceBalancedObject(html, rawStart) ?? match[1].trim() : match[1].trim();

    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    collectSections(parsed, sections, seen);
    if (sections.length > 0) break;
  }

  if (sections.length === 0) return null;

  const itemCount = sections.reduce((sum, s) => sum + s.items.length, 0);
  console.log(
    `  🧩 Embedded state yielded ${sections.length} section(s), ${itemCount} item(s) from ${pageUrl}`,
  );

  return {
    sections,
    method: "platform",
    source_url: pageUrl,
    raw_text: `[embedded platform state from ${pageUrl}]`,
  };
}
