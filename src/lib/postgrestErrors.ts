/**
 * Recognising a "that column does not exist" failure from PostgREST, on the
 * client side.
 *
 * THIS IS A MIRROR of supabase/functions/_shared/postgrestErrors.ts, not an
 * import. That module is Deno source: it ships with the edge functions, uses
 * Deno's extension-bearing import style, and pulling it into the browser bundle
 * would drag the functions' module graph across a boundary the tsconfigs keep
 * apart. src/lib/__tests__/postgrestErrors.test.ts compares the two files and
 * fails when they drift, which is the same arrangement eventCategories uses.
 *
 * WHY THE WEB APP NEEDS IT. Cloudflare Pages deploys on push to main while
 * migrations are applied by hand, so there is a window in which a page asking
 * for a column the migration adds gets the WHOLE select rejected - not the one
 * field. For a detail page that is a 404 on a URL that worked yesterday. A
 * reader that can recognise the failure can fall back to the old query for the
 * one release it takes.
 *
 * TWO CODES, because PostgREST reports this two different ways depending on
 * whether its schema cache or Postgres itself catches it first:
 *   42703    - Postgres `undefined_column`, raised by the database
 *   PGRST204 - "Could not find the 'x' column of 'y' in the schema cache"
 * Matching only one of them misses half the cases.
 */

export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Postgres `undefined_column`. */
export const UNDEFINED_COLUMN = "42703";
/** PostgREST could not find the column in its cached schema. */
export const PGRST_SCHEMA_CACHE_MISS = "PGRST204";

/**
 * True when the failure is "you named a column that is not there".
 *
 * Falls back to matching the message text, because the code is not always
 * populated on errors that pass through the supabase-js client.
 */
export function isUnknownColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as PostgrestLikeError;

  const code = candidate.code ?? "";
  if (code === UNDEFINED_COLUMN || code === PGRST_SCHEMA_CACHE_MISS) return true;

  const text = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  if (text.length === 0) return false;

  // "column \"slug\" of relation \"playgrounds\" does not exist"
  // "Could not find the 'slug' column of 'playgrounds' in the schema cache"
  return (
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("could not find") && text.includes("column"))
  );
}
