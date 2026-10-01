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
 * The one definition of a visible event (src/lib/eventQuery.ts) plus "has not
 * started yet": not merged, not hidden, not archived, and dated at or after
 * `now`. A row with no date is not upcoming.
 */
export function isLinkableUpcomingEvent(row: NearbyEventRow, now: Date): boolean {
  if (row.is_merged === true || row.is_hidden === true || row.archived_at) return false;
  const at = row.date ? Date.parse(row.date) : NaN;
  return Number.isFinite(at) && at >= now.getTime();
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
