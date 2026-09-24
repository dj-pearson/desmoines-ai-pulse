import type { RestaurantFilterOptions } from "@/components/RestaurantFilters";

/**
 * Values the /restaurants filter controls offer (docs/page-plans/eat-drink.md
 * WP2). Plain data and pure functions, kept out of the component files so they
 * stay component-only (react-refresh) and so
 * src/lib/__tests__/restaurantPresets.test.ts can pin them.
 */

/**
 * Dietary choices. The values must stay keys of DIETARY_KEYWORDS in
 * useRestaurants.ts; resolveDietarySelections drops anything else, and the
 * filter would silently stop matching (WEB-FEAT-032).
 */
export const DIETARY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "gluten-free", label: "Gluten-Free" },
  { value: "keto", label: "Keto" },
  { value: "halal", label: "Halal" },
];

/** The unfiltered hub. A preset is applied on top of this, never merged into current filters. */
export const DEFAULT_RESTAURANT_FILTERS: RestaurantFilterOptions = {
  search: "",
  cuisine: [],
  priceRange: [],
  rating: [0, 5],
  location: [],
  sortBy: "popularity",
  featuredOnly: false,
  openNow: false,
  tags: [],
};

export type RestaurantPresetIcon = "heart" | "users" | "coffee" | "leaf";

export interface RestaurantPreset {
  id: string;
  label: string;
  description: string;
  icon: RestaurantPresetIcon;
  /**
   * Only fields the query actually models. No `openNow` (nothing reads it
   * server-side yet, plan D2) and no non-dietary `tags` (the hook drops them),
   * which is why Quick Lunch and Late Night are gone and Date Night / Family
   * Friendly lost their tag.
   */
  filters: Partial<RestaurantFilterOptions>;
}

export const RESTAURANT_PRESETS: readonly RestaurantPreset[] = [
  {
    id: "date-night",
    label: "Date Night",
    description: "$$$ and up, 4+ stars",
    icon: "heart",
    filters: { priceRange: ["$$$", "$$$$"], rating: [4, 5], sortBy: "rating" },
  },
  {
    // With Kids was the same query at a narrower price, so it merged in here.
    id: "family-dinner",
    label: "Family Friendly",
    description: "$ and $$, most popular",
    icon: "users",
    filters: { priceRange: ["$", "$$"], sortBy: "popularity" },
  },
  {
    id: "brunch",
    label: "Brunch",
    description: "Cafes and breakfast spots",
    icon: "coffee",
    filters: { cuisine: ["Cafe", "Brunch", "Breakfast", "American"], sortBy: "rating" },
  },
  {
    id: "healthy",
    label: "Healthy",
    description: "Vegetarian, vegan, salads",
    icon: "leaf",
    filters: { cuisine: ["Vegetarian", "Vegan", "Health Food", "Salad"], sortBy: "rating" },
  },
];

/**
 * Presets that would change the result set given today's cuisine facet.
 *
 * A cuisine preset keeps only the cuisines that have rows, and disappears when
 * none do: a chip that returns nothing is a dead control. While the facet is
 * still loading (undefined), cuisine presets are held back rather than shown
 * and then removed under the visitor's thumb.
 */
export function availableRestaurantPresets(
  cuisineCounts: ReadonlyArray<{ cuisine: string; count: number }> | undefined,
  presets: readonly RestaurantPreset[] = RESTAURANT_PRESETS
): RestaurantPreset[] {
  const present = new Set(
    (cuisineCounts ?? []).filter((c) => c.count > 0).map((c) => c.cuisine)
  );
  const out: RestaurantPreset[] = [];
  for (const preset of presets) {
    const cuisines = preset.filters.cuisine;
    if (!cuisines || cuisines.length === 0) {
      out.push(preset);
      continue;
    }
    const kept = cuisines.filter((c) => present.has(c));
    if (kept.length === 0) continue;
    out.push({ ...preset, filters: { ...preset.filters, cuisine: kept } });
  }
  return out;
}

/** The full filter set a preset applies: the unfiltered hub plus the preset. */
export function presetFilters(preset: RestaurantPreset): RestaurantFilterOptions {
  return { ...DEFAULT_RESTAURANT_FILTERS, ...preset.filters };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

export function sameRestaurantFilters(
  a: RestaurantFilterOptions,
  b: RestaurantFilterOptions
): boolean {
  return (
    (a.search ?? "") === (b.search ?? "") &&
    sameSet(a.cuisine, b.cuisine) &&
    sameSet(a.priceRange, b.priceRange) &&
    sameSet(a.location, b.location) &&
    sameSet(a.tags, b.tags) &&
    a.rating[0] === b.rating[0] &&
    a.rating[1] === b.rating[1] &&
    a.sortBy === b.sortBy &&
    a.featuredOnly === b.featuredOnly &&
    a.openNow === b.openNow
  );
}

/**
 * Which preset the current filters are, if any. Derived from the filters (the
 * URL) rather than remembered, so reloading a preset's URL shows it active and
 * editing any filter clears it.
 */
export function activeRestaurantPresetId(
  filters: RestaurantFilterOptions,
  presets: readonly RestaurantPreset[]
): string | null {
  const match = presets.find((p) => sameRestaurantFilters(filters, presetFilters(p)));
  return match ? match.id : null;
}

/** Cuisines offered in the restaurants dropdown (docs/page-plans/eat-drink.md WP2 item 6). */
const MAX_CUISINES = 3;

/**
 * Facet cuisines whose name contains the typed text, prefix matches first.
 * Matched in the browser against the cached facet list, so it costs no request.
 */
export function matchCuisines(
  cuisines: ReadonlyArray<{ cuisine: string; count: number }>,
  typed: string,
  limit = MAX_CUISINES
): string[] {
  const needle = typed.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits = cuisines.filter((c) => c.count > 0 && c.cuisine.toLowerCase().includes(needle));
  const starts = hits.filter((c) => c.cuisine.toLowerCase().startsWith(needle));
  const rest = hits.filter((c) => !c.cuisine.toLowerCase().startsWith(needle));
  return [...starts, ...rest].slice(0, limit).map((c) => c.cuisine);
}
