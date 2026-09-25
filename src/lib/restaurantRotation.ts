import { formatInTimeZone } from "date-fns-tz";
import { CENTRAL_TIMEZONE } from "@/lib/timezone";

/**
 * Per-day seed used by `get_rotated_restaurants` so the popularity sort
 * rotates which top restaurants appear first each day. Stable for the day
 * so pagination doesn't reshuffle between pages, but changes over time so
 * users don't see the same first 20 every visit.
 *
 * The day is the Des Moines calendar day. It used to be the UTC day, which
 * turns over at 7pm Central (6pm in winter): a visitor paging through dinner
 * options at 7pm got page 2 from a different shuffle than page 1, so rows
 * repeated and others were never shown.
 *
 * The value is still "days since 1970-01-01", so it stays an integer of the
 * same size the RPC has always received.
 */
export function getRestaurantRotationSeed(now: Date = new Date()): number {
  const [y, m, d] = formatInTimeZone(now, CENTRAL_TIMEZONE, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Which sponsored rows get the two boosted slots today (eat-drink pass 2 WP1
 * item 8).
 *
 * The sponsored query used to order by popularity_score and take two, so a
 * third paying sponsor never reached the slot at all. The hub now fetches up
 * to ten matching sponsors and this picks `cap` of them, walking a window
 * over the id-sorted list one step per Des Moines day. Sorting by id first
 * makes the pick independent of the order the server happened to return, and
 * walking the window means every sponsor gets a turn: four sponsors with two
 * slots each appear on two of every four days.
 *
 * Deterministic for a seed, so page 1 and a Load More agree within a day.
 */
export function pickDailySponsors<T extends { id: string }>(
  rows: readonly T[],
  seed: number,
  cap: number
): T[] {
  if (cap <= 0 || rows.length === 0) return [];
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  if (unique.length <= cap) return unique;
  const n = unique.length;
  const start = ((Math.trunc(seed) % n) + n) % n;
  return Array.from({ length: cap }, (_, i) => unique[(start + i) % n]);
}
