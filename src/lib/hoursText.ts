/**
 * SEO-054. Is this value hours text, or something else wearing its name?
 *
 * restaurants.opening is a `date` column in production (checked 2026-10-01 in
 * information_schema), not the free-text hours the readers were written for.
 * PostgREST serialises it as "2026-03-15", and the text parser read that as a
 * range: "03-15" is 03:00 to 15:00 every day, so a restaurant's opening date
 * would have rendered as "Open until 3 PM". Every reader of `opening` as hours
 * goes through this first, and a date (or a timestamp) is not hours.
 *
 * No imports: src/lib/restaurantMeta.ts uses it, and scripts load that file
 * under tsx by relative path.
 */

/** "2026-03-15", "2026-03-15T00:00:00", "2026-03-15 00:00:00+00", and so on. */
const DATE_SHAPED = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** The trimmed hours text, or null for a non-string, an empty string or a date. */
export function hoursTextOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || DATE_SHAPED.test(text)) return null;
  return text;
}
