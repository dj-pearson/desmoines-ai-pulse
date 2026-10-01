/**
 * Recognising a "that column does not exist" failure from PostgREST.
 *
 * WHY THIS MATTERS HERE. Migrations and edge functions deploy on separate
 * schedules. A function that writes a column added by a migration in the same
 * commit will, in the window before `supabase db push` runs, have its ENTIRE
 * statement rejected for one unknown key - not just the new field. For a write
 * that also carries phone, website, rating and image_url, that turns a missing
 * nicety into a total enrichment outage on a daily cron.
 *
 * The repo has already been bitten by the read-side version of this: 42703 on a
 * SELECT renders as an empty state with no error, which is the WEB-QA-017
 * failure class. This is the write-side equivalent, and it is louder but just
 * as avoidable.
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

  // "column \"reservable\" of relation \"restaurants\" does not exist"
  // "Could not find the 'reservable' column of 'restaurants' in the schema cache"
  return (
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("could not find") && text.includes("column"))
  );
}
