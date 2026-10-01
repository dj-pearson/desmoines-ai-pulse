/**
 * This weekend's events per area, for the /things-to-do area chips (explore
 * pass 2 WP1 item 7).
 *
 * Counted from the rows the hub's weekend line already holds (the
 * /events/this-weekend light rows), so it costs no request. The match rule is
 * eventMatchesArea from neighborhoodTonight.ts, which is the in-memory copy of
 * the `city/venue/location ilike %term%` test /neighborhoods/<slug> sends, so
 * "East Village: 14 this weekend" names events that page can list.
 */
import { eventMatchesArea, type AreaMatchEvent, type AreaMatchTarget } from "@/lib/neighborhoodTonight";

/** Count per area slug. Every area is present, zero included. */
export function countEventsByArea(
  events: readonly AreaMatchEvent[],
  areas: readonly AreaMatchTarget[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const area of areas) {
    let n = 0;
    for (const event of events) if (eventMatchesArea(event, area.matchTerms)) n += 1;
    counts[area.slug] = n;
  }
  return counts;
}

/**
 * "14 this weekend", or "14+ this weekend" when the weekend query hit its row
 * cap and the count is only a floor. Null at zero or for a count that is not
 * a finite number: a chip reading "0 this weekend" says less than the name.
 */
export function weekendAreaLabel(count: number | undefined, capped: boolean): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return `${count}${capped ? "+" : ""} this weekend`;
}
