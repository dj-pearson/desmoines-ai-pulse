import type { Neighborhood } from "@/lib/neighborhoods";

/**
 * Tonight's events per area, for the home page's area strip (home pass-2 WP4
 * item 9). Counted from the Tonight rail's rows (useTonightEvents), so it
 * costs no request of its own.
 *
 * THE MATCH RULE IS useNeighborhoodContent's. That hook sends
 * `city/location/venue ilike %term%` for each of an area's matchTerms, which is
 * a case-insensitive substring test; this is the same test in memory, so a
 * chip saying "Ankeny, 3 tonight" names events /neighborhoods/ankeny lists.
 * An event counts once per area, however many terms it matches.
 */

/** The event columns the match reads. TonightEvent satisfies it. */
export interface AreaMatchEvent {
  city?: string | null;
  venue?: string | null;
  location?: string | null;
}

export type AreaMatchTarget = Pick<Neighborhood, "slug" | "matchTerms">;

/** Does any of city, venue or location contain any term, ignoring case? */
export function eventMatchesArea(event: AreaMatchEvent, terms: readonly string[]): boolean {
  const fields = [event.city, event.venue, event.location]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  if (fields.length === 0) return false;
  return terms.some((term) => {
    const t = term.trim().toLowerCase();
    return t.length > 0 && fields.some((f) => f.includes(t));
  });
}

/** Tonight's count per area slug. Every area is present, zero included. */
export function countTonightByArea(
  events: readonly AreaMatchEvent[],
  areas: readonly AreaMatchTarget[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const area of areas) {
    counts[area.slug] = events.reduce(
      (n, event) => (eventMatchesArea(event, area.matchTerms) ? n + 1 : n),
      0,
    );
  }
  return counts;
}

/**
 * "3 tonight", or "3+ tonight" when the rail's query hit its row cap and the
 * count is only a floor. Null at zero: a chip reading "0 tonight" says less
 * than the name alone, and with a capped query zero is not even known.
 */
export function tonightCountLabel(count: number, capped: boolean): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return `${count}${capped ? "+" : ""} tonight`;
}
