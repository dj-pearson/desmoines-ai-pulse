/**
 * Count-aware copy helpers (WEB-QA-006).
 *
 * List headers across the site interpolated a raw count straight into a plural
 * noun — "1 events in Des Moines", "1 results", "1 attractions found" — which
 * reads as unfinished on exactly the pages a first-time visitor lands on after
 * a narrow filter, i.e. when the count is most likely to be 1.
 *
 * Deliberately tiny and dependency-free: this is English count agreement for
 * known nouns, not i18n. If the site ever ships a second locale, replace these
 * with Intl.PluralRules rather than extending the irregulars map.
 */

/** Plurals that aren't formed by appending "s". Extend as needed. */
const IRREGULAR_PLURALS: Record<string, string> = {
  is: "are",
  was: "were",
  has: "have",
  this: "these",
  it: "they",
};

/**
 * Pluralize `singular` according to `count`.
 *
 * @example pluralize(1, "event")            // "event"
 * @example pluralize(3, "event")            // "events"
 * @example pluralize(3, "match", "matches") // "matches"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) return singular;
  if (plural) return plural;
  if (IRREGULAR_PLURALS[singular]) return IRREGULAR_PLURALS[singular];

  // Handle the common English suffix rules so callers don't have to pass an
  // explicit plural for words like "match" -> "matches" or "city" -> "cities".
  if (/(s|ss|sh|ch|x|z)$/i.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}

/**
 * Format a count together with its noun.
 *
 * @example formatCount(1, "event")  // "1 event"
 * @example formatCount(12, "event") // "12 events"
 */
export function formatCount(
  count: number,
  singular: string,
  plural?: string
): string {
  return `${count.toLocaleString()} ${pluralize(count, singular, plural)}`;
}
