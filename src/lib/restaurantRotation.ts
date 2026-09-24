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
