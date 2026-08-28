/**
 * Make a user-typed string safe to interpolate into a PostgREST filter.
 *
 * WHAT GOES WRONG WITHOUT IT, measured against production:
 *
 *   search "Bar, Grill"   -> 400  failed to parse logic tree
 *   search "a*b"          -> 446 rows, because * is PostgREST's ilike wildcard
 *   search "50% off"      -> % is a LIKE wildcard, so the match silently widens
 *
 * A comma ends a filter clause inside `or(...)`, parentheses group them, and
 * `*` is the wildcard PostgREST accepts in an ilike shorthand. So a search box
 * wired straight into `.or(`title.ilike.%${q}%,...`)` breaks on ordinary typing
 * - a comma is not an exotic input for "Bar, Grill" or "Ankeny, IA".
 *
 * DELIBERATE DUPLICATE of sanitizePostgrestPattern in
 * supabase/functions/_shared/validation.ts, and the duplication is the point of
 * this comment. That module is Deno-side: it lives outside src/, is not in the
 * app's tsconfig, and its SSRF half references Deno.resolveDns. Importing it
 * into a Vite bundle to reach two string replacements is the wrong trade.
 *
 * KEEP THE TWO IN STEP. If one changes, change both - and note that the Deno
 * one deliberately does NOT strip apostrophes: stripping them emptied every
 * search naming Casey's Center, which is 44 events. The same applies here.
 */

/** Escapes the LIKE wildcards so a literal % or _ matches itself. */
export function escapeLikePattern(input: string, maxLength = 200): string {
  return input
    .slice(0, maxLength)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/;/g, '')
    .trim();
}

/**
 * Escapes LIKE wildcards and removes the characters PostgREST parses
 * structurally inside a filter expression.
 *
 * Apostrophes, ampersands, hyphens and accented letters all survive - they are
 * ordinary characters in a venue name and nothing downstream treats them
 * specially.
 */
export function sanitizePostgrestPattern(input: string, maxLength = 200): string {
  return escapeLikePattern(input, maxLength)
    .replace(/[,()*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
