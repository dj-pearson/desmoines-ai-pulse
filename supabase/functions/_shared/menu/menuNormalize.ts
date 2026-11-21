/**
 * Normalization, quality scoring and merging for extracted menus.
 *
 * WHY THIS EXISTS
 * ---------------
 * The old scraper's only quality check was `totalItems < 2` in
 * `saveMenuToDatabase`. Everything else went straight to the database, so a
 * restaurant whose homepage nav happened to parse into four "items" —
 * "Home", "Order Online", "Gift Cards", "Contact Us" — got a published menu,
 * while a real 60-item menu discovered one link later was never even
 * considered because the first non-empty result won unconditionally:
 *
 *     if (extracted && extracted.sections.length > 0) return save(...)
 *
 * This module replaces that with: clean every extraction the same way, score
 * it, and let the orchestrator pick or merge. All of it is pure functions over
 * plain data, so it is unit-testable without a network or a database.
 */

import type {
  ExtractionMethod,
  MenuExtraction,
  MenuItem,
  MenuQuality,
  MenuSection,
} from "./types.ts";

// ─── Price parsing ──────────────────────────────────────────────────────────

/** Prices we accept. Above this a "price" is a phone number, year or zip. */
const MAX_PLAUSIBLE_PRICE = 1000;

/** Price strings that legitimately have no number. */
const NON_NUMERIC_PRICE_RE = /^\s*(market(\s*price)?|mp|seasonal|varies|ask)\b/i;

/**
 * Parse the numeric value out of a displayed price.
 *
 * Takes the FIRST number in the string, which is the correct lower bound for
 * every real-world shape a menu uses: "$10-15" → 10, "Sm $5 / Lg $9" → 5,
 * "$12.99" → 12.99. "Market Price" and friends return null rather than 0, so
 * they sort last instead of appearing to be the cheapest thing on the menu.
 */
export function parsePriceNumeric(price: string | null | undefined): number | null {
  if (!price) return null;
  const text = String(price).trim();
  if (!text) return null;
  if (NON_NUMERIC_PRICE_RE.test(text)) return null;
  if (/^\s*free\s*$/i.test(text)) return 0;

  // Strip thousands separators so "1,299" reads as one number, not "1" then "299".
  const match = text.replace(/(\d),(\d{3})\b/g, "$1$2").match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;

  const value = Number.parseFloat(match[0]);
  if (!Number.isFinite(value) || value < 0 || value > MAX_PLAUSIBLE_PRICE) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Tidy a displayed price. Collapses whitespace and drops strings that carry no
 * price information at all ("", "-", "n/a").
 */
export function normalizePriceText(price: string | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const text = String(price).replace(/\s+/g, " ").trim();
  if (!text || /^(-+|n\/?a|null|none)$/i.test(text)) return null;
  return text.slice(0, 60);
}

// ─── Dietary tags ───────────────────────────────────────────────────────────

/**
 * WEB-BE-072. A dietary badge is a claim the restaurant made about one dish,
 * so a tag is kept only when the menu marks that dish. For someone with celiac
 * disease or a nut allergy a wrong "GF" badge is a health risk, and a missing
 * one only sends them to ask the server, so every rule here errs towards
 * leaving a tag off.
 *
 * What used to happen: any mention anywhere in the name or description tagged
 * the dish. "(GFO)" (gluten-free OPTION) became gluten-free, "veggie" became
 * vegetarian so "Grilled chicken and veggie skewers" was a vegetarian dish, and
 * "ask about our gluten free bun" made a burger gluten-free.
 *
 * What counts as a mark now:
 *  1. A bracketed abbreviation group whose every token is a known marker:
 *     "(V)", "(VG)", "(GF)", "[DF]", "(V, GF)", "(V/GF)". A group holding
 *     anything else ("(GFO)", "(GF option)", "(GF on request)", "(VO)") is not
 *     a mark at all. Counted anywhere in the name, but in the description only
 *     when the groups close it ("Chickpeas, tahini. (V) (GF)"), because a group
 *     mid-sentence usually describes a part ("served on a (GF) bun").
 *  2. The word itself in the dish NAME ("Vegan Burger", "Gluten-Free Brownie",
 *     "Halal Gyro"), and only when the name carries no option or negation word
 *     ("Burger, gluten free bun available", "Non-vegan", "Vegan option").
 *     Words in the description never count: they describe ingredients, sides
 *     and options far more often than the dish.
 *  3. Spicy, raw and organic follow the name rule without the qualifier check;
 *     they are not health claims. A chili pepper or flame emoji in the name
 *     still reads as spicy.
 *
 * `(V)` is vegetarian and `(VG)`/`(VE)`/`(VGN)` vegan, the near-universal US
 * convention. "veggie" is not a marker of anything.
 */
const MARKER_ABBREVIATIONS: Readonly<Record<string, string>> = {
  v: "vegetarian",
  vg: "vegan",
  ve: "vegan",
  vgn: "vegan",
  gf: "gluten-free",
  df: "dairy-free",
};

/** A bracketed group: "(V)", "[GF]", "(V, GF)". */
const MARKER_GROUP_RE = /[([]([^()[\]]{1,24})[)\]]/g;
/** One or more bracketed groups that end the text. */
const TRAILING_MARKER_GROUPS_RE = /(?:[([][^()[\]]{1,24}[)\]]\s*)+$/;

/** Words that make a name's dietary word an option, a request or a negation. */
const QUALIFIER_RE =
  /\b(?:options?|optional|available|avail|request|requested|substitut\w*|sub|ask|add|can\s+be|made\s+to|non|not|no|without)\b|\bw\/o\b/i;

/** Health claims: only from a name with no qualifier. */
const NAME_WORD_PATTERNS: ReadonlyArray<{ tag: string; re: RegExp }> = [
  { tag: "vegan", re: /\bvegan\b/i },
  { tag: "vegetarian", re: /\bvegetarian\b/i },
  { tag: "gluten-free", re: /\bgluten[\s-]?free\b/i },
  { tag: "dairy-free", re: /\bdairy[\s-]?free\b/i },
  { tag: "nut-free", re: /\bnut[\s-]?free\b/i },
  { tag: "halal", re: /\bhalal\b/i },
  { tag: "kosher", re: /\bkosher\b/i },
];

/** Not health claims: from the name, qualifier or not. */
const NAME_DESCRIPTOR_PATTERNS: ReadonlyArray<{ tag: string; re: RegExp }> = [
  // U+1F336 hot pepper, U+1F525 fire: menus use them as the spicy mark.
  { tag: "spicy", re: /\bspicy\b|\u{1F336}|\u{1F525}/iu },
  { tag: "raw", re: /\braw\b/i },
  { tag: "organic", re: /\borganic\b/i },
];

const VALID_TAGS = new Set<string>([
  ...Object.values(MARKER_ABBREVIATIONS),
  ...NAME_WORD_PATTERNS.map((p) => p.tag),
  ...NAME_DESCRIPTOR_PATTERNS.map((p) => p.tag),
]);

/** Tags from bracketed abbreviation groups; a group with any unknown token counts for nothing. */
function markerGroupTags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(MARKER_GROUP_RE)) {
    const tokens = match[1].toLowerCase().split(/[\s,/|&+]+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const mapped = tokens.map((t) => MARKER_ABBREVIATIONS[t]);
    if (mapped.every((tag) => tag !== undefined)) tags.push(...mapped);
  }
  return tags;
}

export interface DietaryTagOptions {
  /**
   * Keep the tags the source reported. True only for structured sources (the
   * restaurant's own schema.org suitableForDiet, a platform's diet flags),
   * where the tag IS the restaurant's mark. A model's reported tags are not
   * trusted: it reads "veggie" and ingredient lists as diets, so for model
   * output only the marks in the item's own text count.
   */
  trustReported?: boolean;
}

/**
 * The dietary tags the menu itself marks on a dish. See the block comment
 * above for what counts. Reported tags are filtered to the known vocabulary
 * and kept only when `trustReported` is set.
 */
export function normalizeDietaryTags(
  reported: unknown,
  name: string,
  description: string | null,
  options: DietaryTagOptions = {},
): string[] {
  const tags = new Set<string>();

  if (options.trustReported && Array.isArray(reported)) {
    for (const raw of reported) {
      const tag = String(raw).toLowerCase().trim().replace(/\s+/g, "-");
      if (VALID_TAGS.has(tag)) tags.add(tag);
    }
  }

  for (const tag of markerGroupTags(name)) tags.add(tag);

  const trailing = (description ?? "").trim().match(TRAILING_MARKER_GROUPS_RE);
  if (trailing) for (const tag of markerGroupTags(trailing[0])) tags.add(tag);

  // Drop the bracketed groups before the qualifier check, so "(GF option)"
  // cannot be read as a qualifier on a word elsewhere and "(V)" is not a word.
  const qualified = QUALIFIER_RE.test(name.replace(MARKER_GROUP_RE, " "));
  if (!qualified) {
    for (const { tag, re } of NAME_WORD_PATTERNS) {
      if (re.test(name)) tags.add(tag);
    }
  }
  for (const { tag, re } of NAME_DESCRIPTOR_PATTERNS) {
    if (re.test(name)) tags.add(tag);
  }

  // A vegan dish is vegetarian, and the vegetarian filter should surface it.
  if (tags.has("vegan")) tags.add("vegetarian");

  return [...tags].sort();
}

/** Extraction methods whose reported dietary tags are the restaurant's own marks. */
const STRUCTURED_METHODS: ReadonlySet<string> = new Set(["jsonld", "platform"]);

// ─── Junk detection ─────────────────────────────────────────────────────────

/**
 * Whole-string matches for site chrome that an LLM working from nav-heavy text
 * routinely reports as menu items.
 *
 * Deliberately ANCHORED. Substring matching would delete real food:
 * "Home Fries", "Contact Grill", "About Thyme Salad" are all plausible items,
 * and a brewery really does sell something called "Order of Wings".
 */
const JUNK_NAME_RE = new RegExp(
  "^(?:" +
    [
      "home",
      "about(?:\\s+us)?",
      "contact(?:\\s+us)?",
      "menus?",
      "our\\s+menus?",
      "full\\s+menus?",
      "view\\s+(?:the\\s+|our\\s+)?menu",
      "see\\s+(?:the\\s+|our\\s+)?menu",
      "download\\s+(?:the\\s+)?menu",
      "order(?:\\s+(?:online|now|here|pickup|delivery))?",
      "reservations?",
      "book\\s+(?:a\\s+)?table",
      "gift\\s*cards?",
      "careers?",
      "jobs",
      "employment",
      "locations?",
      "hours",
      "directions",
      "privacy(?:\\s+policy)?",
      "terms(?:\\s+(?:of\\s+service|and\\s+conditions))?",
      "accessibility",
      "sitemap",
      "newsletter",
      "subscribe",
      "sign\\s*up",
      "sign\\s*in",
      "log\\s*in",
      "my\\s+account",
      "cart",
      "checkout",
      "search",
      "read\\s+more",
      "learn\\s+more",
      "click\\s+here",
      "more\\s+info",
      "follow\\s+us(?:\\s+on\\s+\\w+)?",
      "facebook",
      "instagram",
      "twitter",
      "tiktok",
      "yelp",
      "tripadvisor",
      "google\\s+reviews?",
      "catering",
      "private\\s+events?",
      "events?",
      "gallery",
      "photos?",
      "blog",
      "news",
      "faq s?",
      "faqs?",
      "skip\\s+to\\s+content",
      "back\\s+to\\s+top",
      "copyright",
      "all\\s+rights\\s+reserved",
      "coming\\s+soon",
      "n/?a",
      "tbd",
      "item",
      "items",
      "section",
      "price",
      "prices",
    ].join("|") +
    ")$",
  "i",
);

/** Weekday / hours / phone / address / URL shaped strings are never dishes. */
const HOURS_RE =
  /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(?:\s*[-–—]\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)?\s*[:,]?\s*(?:\d|closed|open)/i;
const PHONE_RE = /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const URL_RE = /^(?:https?:\/\/|www\.)|@[\w.-]+\.\w{2,}$/i;
const ADDRESS_RE = /^\d+\s+[\w\s.]+\b(?:st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|pkwy|hwy|ct|court|pl|place|ste|suite)\b/i;
const PRICE_ONLY_RE = /^\$?\d+(?:\.\d{1,2})?\s*(?:[-–—/]\s*\$?\d+(?:\.\d{1,2})?)?$/;

/** Longest plausible dish name. Anything longer is a captured paragraph. */
const MAX_ITEM_NAME_LENGTH = 90;

/**
 * True when this "item" is site chrome, contact information, or a stray
 * paragraph rather than something you can order.
 */
export function isJunkItemName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  if (trimmed.length > MAX_ITEM_NAME_LENGTH) return true;
  if (JUNK_NAME_RE.test(trimmed)) return true;
  if (HOURS_RE.test(trimmed)) return true;
  if (PHONE_RE.test(trimmed)) return true;
  if (URL_RE.test(trimmed)) return true;
  if (ADDRESS_RE.test(trimmed)) return true;
  if (PRICE_ONLY_RE.test(trimmed)) return true;
  // No letters at all — bullets, separators, emoji runs.
  if (!/[a-z]/i.test(trimmed)) return true;
  // A sentence, not a name: multiple clauses and a trailing period.
  if (/[.!?]\s+\S/.test(trimmed) && trimmed.split(/\s+/).length > 10) return true;
  return false;
}

/** Section names that carry no information, used when judging quality. */
const GENERIC_SECTION_RE = /^(?:main\s+menu|menu|items?|other|misc(?:ellaneous)?|general|uncategorized)$/i;

export function isGenericSectionName(name: string): boolean {
  return GENERIC_SECTION_RE.test(name.trim());
}

// ─── Normalization ──────────────────────────────────────────────────────────

/** Collapse to a stable key for duplicate detection. */
export function itemKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSectionName(name: unknown): string {
  const text = String(name ?? "").replace(/\s+/g, " ").replace(/[:\-–—]+$/, "").trim();
  if (!text) return "Main Menu";
  return text.slice(0, 80);
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || /^(null|undefined|n\/?a|none)$/i.test(text)) return null;
  return text.slice(0, maxLength);
}

/**
 * Clean one raw extraction: drop junk items, repair prices, infer dietary
 * tags, deduplicate, and renumber sort orders.
 *
 * Deduplication is per-section, not global: an item genuinely can appear under
 * both "Lunch" and "Dinner" at different prices, and collapsing those would
 * lose the cheaper one.
 */
export function normalizeExtraction(extraction: MenuExtraction): MenuExtraction {
  const sections: MenuSection[] = [];

  const rawSections = Array.isArray(extraction.sections) ? extraction.sections : [];

  for (const rawSection of rawSections) {
    if (!rawSection || !Array.isArray(rawSection.items)) continue;

    const sectionName = normalizeSectionName(rawSection.section_name);
    const seen = new Map<string, MenuItem>();

    for (const rawItem of rawSection.items) {
      if (!rawItem) continue;
      const name = normalizeText(rawItem.item_name, MAX_ITEM_NAME_LENGTH + 30);
      if (!name || isJunkItemName(name)) continue;

      const description = normalizeText(rawItem.item_description, 500);
      const price = normalizePriceText(rawItem.price);
      // Trust the model's numeric only when it agrees with the displayed text;
      // re-parsing catches the common "price_numeric: 0" for "Market Price".
      const parsed = parsePriceNumeric(price);
      const reported =
        typeof rawItem.price_numeric === "number" && Number.isFinite(rawItem.price_numeric)
          ? rawItem.price_numeric
          : null;
      const priceNumeric =
        parsed !== null
          ? parsed
          : reported !== null && reported > 0 && reported <= MAX_PLAUSIBLE_PRICE
          ? Math.round(reported * 100) / 100
          : null;

      const item: MenuItem = {
        item_name: name,
        item_description: description === name ? null : description,
        price,
        price_numeric: priceNumeric,
        dietary_tags: normalizeDietaryTags(rawItem.dietary_tags, name, description, {
          trustReported: STRUCTURED_METHODS.has(extraction.method),
        }),
        is_popular: rawItem.is_popular === true,
      };

      const key = itemKey(name);
      const existing = seen.get(key);
      seen.set(key, existing ? mergeItems(existing, item) : item);
    }

    if (seen.size > 0) {
      sections.push({
        section_name: sectionName,
        section_sort_order: sections.length,
        items: [...seen.values()],
      });
    }
  }

  return { ...extraction, sections };
}

/** Combine two records of the same dish, keeping whichever field is richer. */
function mergeItems(a: MenuItem, b: MenuItem): MenuItem {
  return {
    item_name: a.item_name,
    item_description: a.item_description ?? b.item_description,
    price: a.price ?? b.price,
    price_numeric: a.price_numeric ?? b.price_numeric,
    dietary_tags: [...new Set([...a.dietary_tags, ...b.dietary_tags])].sort(),
    is_popular: a.is_popular || b.is_popular,
  };
}

// ─── Quality scoring ────────────────────────────────────────────────────────

/** Below this an extraction is not published, no matter which path produced it. */
export const QUALITY_THRESHOLD = 0.25;
/** A menu with fewer items than this is assumed to be a fragment. */
export const MIN_ITEMS = 3;

/**
 * Score a *normalized* extraction from 0 to 1.
 *
 * The weights are tuned so a brewery tap list — a dozen beers, one section, no
 * prices and no descriptions, which is a perfectly real menu — clears the bar,
 * while a four-item fragment scraped off a homepage teaser does not.
 */
export function scoreExtraction(extraction: MenuExtraction): MenuQuality {
  const sections = extraction.sections;
  const items = sections.flatMap((s) => s.items);
  const itemCount = items.length;
  const warnings: string[] = [];

  if (itemCount === 0) {
    return {
      score: 0,
      item_count: 0,
      section_count: 0,
      priced_ratio: 0,
      described_ratio: 0,
      warnings: ["no items"],
    };
  }

  const pricedRatio = items.filter((i) => i.price_numeric !== null).length / itemCount;
  const describedRatio = items.filter((i) => i.item_description).length / itemCount;
  const namedSectionRatio =
    sections.filter((s) => !isGenericSectionName(s.section_name)).length / sections.length;

  let score =
    Math.min(itemCount / 20, 1) * 0.35 +
    Math.min(sections.length / 4, 1) * 0.15 +
    pricedRatio * 0.3 +
    describedRatio * 0.1 +
    namedSectionRatio * 0.1;

  if (itemCount < MIN_ITEMS) {
    warnings.push(`only ${itemCount} item(s)`);
    score *= 0.3;
  }
  if (pricedRatio === 0) {
    warnings.push("no prices found");
  }
  if (namedSectionRatio === 0) {
    warnings.push("all sections generically named");
  }
  // Many single-item sections means the model split a list rather than grouped
  // it — usually a sign it was reading nav or a card grid, not a menu.
  const singletonSections = sections.filter((s) => s.items.length === 1).length;
  if (sections.length >= 4 && singletonSections / sections.length > 0.7) {
    warnings.push("most sections contain a single item");
    score *= 0.6;
  }

  return {
    score: Math.min(Math.round(score * 1000) / 1000, 1),
    item_count: itemCount,
    section_count: sections.length,
    priced_ratio: Math.round(pricedRatio * 100) / 100,
    described_ratio: Math.round(describedRatio * 100) / 100,
    warnings,
  };
}

/** Whether an extraction is good enough to publish. */
export function passesQualityGate(quality: MenuQuality): boolean {
  return quality.item_count >= MIN_ITEMS && quality.score >= QUALITY_THRESHOLD;
}

/**
 * Relative trust in each extraction path, used only to break ties between
 * results that scored within noise of each other. Structured data is exact;
 * text extraction over flattened HTML is the guessiest.
 */
const METHOD_PRECISION: Record<ExtractionMethod, number> = {
  jsonld: 5,
  platform: 5,
  merged: 4,
  pdf_vision: 3,
  image_vision: 2,
  html_text: 1,
};

/**
 * Order candidates best-first. Score leads; when two candidates are within
 * noise, prefer the more precise method, then the larger menu — a complete
 * menu from a PDF beats a partial one scraped off the page it was linked from.
 */
export function rankExtractions(
  candidates: Array<{ extraction: MenuExtraction; quality: MenuQuality }>,
): Array<{ extraction: MenuExtraction; quality: MenuQuality }> {
  return [...candidates].sort((a, b) => {
    if (Math.abs(a.quality.score - b.quality.score) > 0.05) {
      return b.quality.score - a.quality.score;
    }
    const precision =
      METHOD_PRECISION[b.extraction.method] - METHOD_PRECISION[a.extraction.method];
    if (precision !== 0) return precision;
    return b.quality.item_count - a.quality.item_count;
  });
}

// ─── Merging ────────────────────────────────────────────────────────────────

/**
 * Fold `addition` into `base`, keeping `base` authoritative.
 *
 * This is what makes multi-page menus work. Barn Town-style sites split food,
 * brunch and the tap list across three pages; Bix & Co-style sites split
 * breakfast and lunch. Each page extracts fine on its own and each one is an
 * incomplete menu — the old code published whichever it happened to reach
 * first and discarded the rest.
 *
 * Items already present in `base` under ANY section are dropped from
 * `addition`, which also removes the homepage-teaser duplicates that would
 * otherwise appear twice under different section names.
 */
export function mergeExtractions(base: MenuExtraction, addition: MenuExtraction): MenuExtraction {
  const sections = base.sections.map((s) => ({ ...s, items: [...s.items] }));
  const bySectionKey = new Map<string, MenuSection>();
  for (const section of sections) {
    bySectionKey.set(itemKey(section.section_name), section);
  }

  const knownItems = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) knownItems.add(itemKey(item.item_name));
  }

  for (const incoming of addition.sections) {
    const fresh = incoming.items.filter((item) => !knownItems.has(itemKey(item.item_name)));
    if (fresh.length === 0) continue;
    for (const item of fresh) knownItems.add(itemKey(item.item_name));

    const key = itemKey(incoming.section_name);
    const existing = bySectionKey.get(key);
    if (existing) {
      existing.items.push(...fresh);
    } else {
      const section: MenuSection = {
        section_name: incoming.section_name,
        section_sort_order: sections.length,
        items: fresh,
      };
      sections.push(section);
      bySectionKey.set(key, section);
    }
  }

  sections.forEach((section, index) => {
    section.section_sort_order = index;
  });

  // Combining two sources is a merge even when both used the same method —
  // `extraction_method` records how the PUBLISHED menu was assembled, and
  // "html_text" would misreport a menu stitched from three separate pages.
  const sameSource = base.source_url === addition.source_url;
  return {
    sections,
    method: sameSource && base.method === addition.method ? base.method : "merged",
    source_url: sameSource ? base.source_url : `${base.source_url} +${addition.source_url}`,
    raw_text: `${base.raw_text}\n\n---\n\n${addition.raw_text}`.slice(0, 100_000),
  };
}

/** Total items across all sections. */
export function countItems(extraction: MenuExtraction): number {
  return extraction.sections.reduce((sum, s) => sum + s.items.length, 0);
}
