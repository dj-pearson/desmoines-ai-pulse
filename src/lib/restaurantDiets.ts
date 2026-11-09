/**
 * The one diet keyword table on the web (WEB-FEAT-054).
 *
 * The /restaurants list filter (useRestaurants, useRestaurantMapPoints) and the
 * /restaurants/dietary pages (useDietaryRestaurants) used to keep a table each.
 * The list's had no kosher and keto without "ketogenic", so /restaurants with
 * keto selected listed fewer rows than /restaurants/dietary/keto and the list
 * could not filter for kosher at all. Both now read this file. iOS mirrors it
 * (src/hooks/__tests__/iosDietaryParity.test.ts reads the Swift source).
 *
 * THIS IS A KEYWORD MATCH, NOT A VERIFICATION. A row is listed when its name,
 * cuisine or description contains one of these words. "No vegan options"
 * matches "vegan". The pages say so, and nothing here may be labelled
 * "verified" until the list comes from menu dietary_tags (plan D5).
 *
 * Keywords are fixed strings interpolated into PostgREST ilike filters, so they
 * must never contain a comma, parenthesis or anything user-typed. "gf" was
 * dropped because it matched any description containing "gf" inside a word.
 */
export const DIETS = [
  { id: "vegan", label: "Vegan", keywords: ["vegan"] },
  { id: "vegetarian", label: "Vegetarian", keywords: ["vegetarian", "veggie"] },
  { id: "gluten-free", label: "Gluten-Free", keywords: ["gluten free", "gluten-free", "celiac"] },
  { id: "keto", label: "Keto", keywords: ["keto", "low carb", "ketogenic"] },
  { id: "halal", label: "Halal", keywords: ["halal"] },
  { id: "kosher", label: "Kosher", keywords: ["kosher"] },
] as const;

export type DietId = (typeof DIETS)[number]["id"];
export type Diet = (typeof DIETS)[number];

/** DIETS keyed by id, for the list filter's `tags` values. */
export const DIETARY_KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  DIETS.map((d) => [d.id, d.keywords]),
);

/** The restaurant columns a diet keyword is searched in. */
const DIETARY_FIELDS = ["description", "cuisine", "name"] as const;

/**
 * The PostgREST ilike clauses for the list filter's dietary selections, OR-ed
 * by the caller: every keyword of every selected diet across description,
 * cuisine and name. Unknown ids yield nothing (resolveDietarySelections in
 * useRestaurants.ts already drops them), so a stray `tags` value can never
 * become a search for its own slug.
 */
export function dietaryIlikeClauses(dietIds: readonly string[]): string[] {
  return dietIds.flatMap((id) =>
    (DIETARY_KEYWORDS[id] ?? []).flatMap((kw) =>
      // postgrest-safe: kw is a fixed keyword from DIETS above
      DIETARY_FIELDS.map((field) => `${field}.ilike.%${kw}%`),
    ),
  );
}
