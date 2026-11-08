/**
 * The "nearby" selectors behind the lateral links on event and restaurant
 * pages (SEO-044, after SEO-015): which restaurants and which upcoming events
 * a page may call nearby. Pure, so the eligibility rule is tested without a
 * database and the hook that fetches the rows cannot drift from it.
 *
 * The query narrows by the cheap conditions (a bounding box, not merged, not
 * closed, the event visibility switches). These functions re-check every one
 * of them and apply the rest, because a row that slipped through the query
 * would otherwise render as a link under the word "nearby".
 */
import { isInMetro } from "@/lib/geo";
import { isPermanentlyClosedRestaurant, isVisitableStatus } from "@/lib/restaurantHours";
import { nearby, NEARBY_MILES } from "@/lib/venuePages";

type Coord = number | string | null | undefined;

export interface NearbyOrigin {
  latitude: Coord;
  longitude: Coord;
}

export interface NearbyRestaurantRow {
  id: string;
  latitude: Coord;
  longitude: Coord;
  status?: string | null;
  business_status?: string | null;
  is_merged?: boolean | null;
  cuisine?: string | null;
}

export interface NearbyEventRow {
  id: string;
  latitude: Coord;
  longitude: Coord;
  date?: string | null;
  end_date?: string | null;
  is_merged?: boolean | null;
  is_hidden?: boolean | null;
  archived_at?: string | null;
}

function num(value: Coord): number {
  return value == null || value === "" ? NaN : Number(value);
}

/**
 * A point we can measure from: both coordinates finite and not the 0,0 a
 * failed geocode writes. Anything else gets no nearby list at all, rather
 * than an arbitrary one labelled "nearby".
 */
export function isLocated(point: NearbyOrigin | null | undefined): boolean {
  if (!point) return false;
  const lat = num(point.latitude);
  const lng = num(point.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

/**
 * Can this restaurant be linked as a place to go? Not merged (merging is also
 * how out-of-scope and not-a-restaurant rows are retired), not closed for
 * good by our status or Google's, open today by lifecycle (announced and
 * opening-soon places are left out), and inside the metro box.
 */
export function isLinkableRestaurant(row: NearbyRestaurantRow): boolean {
  if (row.is_merged === true) return false;
  if (isPermanentlyClosedRestaurant(row)) return false;
  if (!isVisitableStatus(row.status)) return false;
  const lat = num(row.latitude);
  const lng = num(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return isInMetro(lat, lng);
}

/**
 * Restaurants within NEARBY_MILES of `origin`, nearest first. With
 * `preferCuisine`, same-cuisine rows come first, each group still nearest
 * first. `excludeId` drops the page's own row.
 */
export function selectNearbyRestaurants<T extends NearbyRestaurantRow>(
  origin: NearbyOrigin,
  rows: readonly T[],
  opts: { excludeId?: string; limit?: number; preferCuisine?: string | null; maxMiles?: number } = {},
): T[] {
  if (!isLocated(origin)) return [];
  const limit = opts.limit ?? 3;
  const candidates = rows.filter((r) => r.id !== opts.excludeId && isLinkableRestaurant(r));
  const ordered = nearby(origin, candidates, {
    maxMiles: opts.maxMiles ?? NEARBY_MILES,
    limit: candidates.length,
  }).map((x) => x.item);
  const cuisine = opts.preferCuisine?.trim().toLowerCase();
  if (!cuisine) return ordered.slice(0, limit);
  const same = (r: T) => (r.cuisine ?? "").trim().toLowerCase() === cuisine;
  return [...ordered.filter(same), ...ordered.filter((r) => !same(r))].slice(0, limit);
}

/**
 * The one definition of a visible event (src/lib/eventQuery.ts) plus "not
 * over yet": not merged, not hidden, not archived, and either dated at or
 * after `now` or a run whose end_date is at or after `now`. A row with no
 * date is not upcoming. A one-night show that already started stays off:
 * with no end_date there is no telling whether it is still on.
 *
 * The run arm is WEB-FEAT-062: the State Fair dropped off every "nearby"
 * rail at the fairgrounds after its first morning.
 */
export function isLinkableUpcomingEvent(row: NearbyEventRow, now: Date): boolean {
  if (row.is_merged === true || row.is_hidden === true || row.archived_at) return false;
  const at = row.date ? Date.parse(row.date) : NaN;
  if (!Number.isFinite(at)) return false;
  if (at >= now.getTime()) return true;
  const end = row.end_date ? Date.parse(row.end_date) : NaN;
  return Number.isFinite(end) && end >= now.getTime();
}

/**
 * Upcoming events within NEARBY_MILES of `origin`, nearest first. `excludeIds`
 * drops the page's own event and anything another rail on the page already
 * shows, so one event is never linked twice.
 */
export function selectNearbyEvents<T extends NearbyEventRow>(
  origin: NearbyOrigin,
  rows: readonly T[],
  opts: { excludeIds?: readonly string[]; limit?: number; now?: Date; maxMiles?: number } = {},
): T[] {
  if (!isLocated(origin)) return [];
  const now = opts.now ?? new Date();
  const skip = new Set(opts.excludeIds ?? []);
  const candidates = rows.filter((r) => !skip.has(r.id) && isLinkableUpcomingEvent(r, now));
  return nearby(origin, candidates, { maxMiles: opts.maxMiles ?? NEARBY_MILES, limit: opts.limit ?? 3 }).map(
    (x) => x.item,
  );
}

/**
 * What the nearby scan selects: the columns the selectors above read, and
 * nothing a card renders (WEB-PERF, loop 9). The scan pulls up to 60 rows in
 * a bounding box to keep 3 or 4, so it used to carry the full list projection
 * (description included) for rows nobody saw. useNearbyListings now scans with
 * these, then fetches the card columns for the survivors only.
 *
 * Every name is a column of the table in src/integrations/supabase/types.ts,
 * and every one was already selected or filtered on by the scan this
 * replaces, so none of them is new to production. cuisine is here for
 * `preferCuisine`; the event visibility flags are here because
 * isLinkableUpcomingEvent re-checks them.
 */
export const NEARBY_RESTAURANT_SCAN_COLUMNS =
  "id, latitude, longitude, status, business_status, is_merged, cuisine";
export const NEARBY_EVENT_SCAN_COLUMNS =
  "id, latitude, longitude, date, end_date, is_merged, is_hidden, archived_at";

/**
 * `rows` in the order of `ids`, dropping any id with no row (deleted between
 * the scan and the card fetch) and any row whose id was not asked for. A
 * PostgREST `in.(...)` filter returns rows in no particular order, and the
 * order here is the selector's: nearest first, same cuisine first.
 */
export function orderByIds<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}
