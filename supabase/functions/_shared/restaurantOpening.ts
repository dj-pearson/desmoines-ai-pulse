/**
 * Restaurant openings are restaurants rows (WEB-BE-054, owner decision
 * 2026-10-18): an opening becomes a restaurant, so it lives in `restaurants`
 * from the start with one of these statuses plus opening_date or
 * opening_timeframe. The public openings list reads exactly these three
 * (useRestaurantOpenings in src/hooks/useSupabase.ts).
 *
 * Shared by ai-crawler and firecrawl-scraper so the two writers cannot
 * disagree again; they used to send openings to two different tables.
 */

/** The ingest category name. Not a table: it maps to OPENING_TABLE. */
export const OPENING_CATEGORY = "restaurant_openings";
export const OPENING_TABLE = "restaurants";

export const OPENING_STATUSES = ["announced", "opening_soon", "newly_opened"] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];

/**
 * restaurants.status has a CHECK, so a model-invented value ("coming_soon")
 * would fail the whole batch insert. Anything unrecognised is "announced",
 * the weakest claim.
 */
export function normalizeOpeningStatus(raw: unknown): OpeningStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  return (OPENING_STATUSES as readonly string[]).includes(value)
    ? (value as OpeningStatus)
    : "announced";
}

/** A leading YYYY-MM-DD, or null. Never a guessed date. */
export function openingDateOnly(raw: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw ?? "").trim());
  return match ? match[1] : null;
}
