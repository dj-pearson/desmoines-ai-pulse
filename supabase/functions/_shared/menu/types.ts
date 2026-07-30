/**
 * Canonical menu types shared by every extraction path.
 *
 * The scraper used to define `MenuSection`/`MenuItem` inline in
 * `scrape-restaurant-menus/index.ts` and again in `parse-menu-upload/index.ts`,
 * so the two paths could (and did) drift. Everything that produces menu data —
 * JSON-LD, a platform adapter, Claude Vision on a PDF, Claude text on HTML —
 * now produces a `MenuExtraction`, which is scored and merged by one set of
 * rules in `menuNormalize.ts`.
 */

/** A single dish/drink on a menu. */
export interface MenuItem {
  item_name: string;
  item_description: string | null;
  /** Price exactly as displayed — "$12.99", "Market Price", "$10-15". */
  price: string | null;
  /** Parsed numeric price for filtering/sorting. Lower bound for ranges. */
  price_numeric: number | null;
  dietary_tags: string[];
  is_popular: boolean;
}

/** A named group of items — "Appetizers", "Tacos", "On Tap". */
export interface MenuSection {
  section_name: string;
  section_sort_order: number;
  items: MenuItem[];
}

/**
 * How a given extraction was obtained. Ordered roughly by precision:
 * structured data is exact, vision and text extraction are inferred.
 *
 * Persisted to `restaurant_menus.extraction_method` and
 * `menu_scrape_attempts.method`, so values are an API surface — add new ones,
 * never rename or remove an existing one.
 */
export type ExtractionMethod =
  | "jsonld" // schema.org Menu/MenuSection/MenuItem in the page
  | "platform" // known menu platform's embedded JSON state
  | "pdf_vision" // Claude Vision over a PDF menu
  | "image_vision" // Claude Vision over photographed/graphic menus
  | "html_text" // Claude text extraction over prepared page text
  | "merged"; // combined from two or more of the above

/** The set of dietary tags the database and UI understand. */
export const DIETARY_TAGS = [
  "vegan",
  "vegetarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "spicy",
  "raw",
  "organic",
  "halal",
  "kosher",
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** One candidate result, before it has been compared against the others. */
export interface MenuExtraction {
  sections: MenuSection[];
  method: ExtractionMethod;
  /** The URL this data actually came from (may differ from the page crawled). */
  source_url: string;
  /** Unstructured text kept for debugging / manual review. */
  raw_text: string;
}

/** Quality assessment of an extraction — see `scoreExtraction`. */
export interface MenuQuality {
  /** 0..1 overall confidence that this is a real, complete menu. */
  score: number;
  item_count: number;
  section_count: number;
  /** Fraction of items that carry a parseable price. */
  priced_ratio: number;
  /** Fraction of items that carry a description. */
  described_ratio: number;
  /** Human-readable reasons the score was reduced. */
  warnings: string[];
}

/** A URL worth trying, with why we think it is worth trying. */
export interface MenuCandidate {
  url: string;
  /** Higher is more promising. */
  score: number;
  kind: "page" | "pdf" | "image";
  /** Anchor text or alt text that produced this candidate. */
  label: string;
  /** True when the link looks like one section of a multi-page menu. */
  isSection: boolean;
  /** Set when the URL belongs to a recognised menu platform. */
  platform?: string;
}
