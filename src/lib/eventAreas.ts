/**
 * Where an event is, as a filter (docs/page-plans/events.md WP0 item 6).
 *
 * Two kinds, named honestly. A CITY area matches `events.city` exactly (case
 * aside): "Des Moines" means the city of Des Moines, not every row whose
 * location text contains "Des Moines", which was every West Des Moines row
 * too. A BBOX area is a district inside Des Moines that no column names, so it
 * matches on coordinates; an event with no coordinates is not in any bbox.
 *
 * The suburb list covers the three the /events FAQ already promises (Altoona,
 * Johnston, Windsor Heights) alongside the four the old location control had.
 *
 * ONE DEFINITION OF EACH SUBURB (events-pass2 WP5 items 5 and 6). Every
 * SUBURBS entry in src/lib/suburbs.ts has a city area here with the same slug
 * and `city` equal to the suburb's name (eventAreas.test.ts pins it), and both
 * /events/<suburb> and the hub's `?location=<suburb>` go through
 * applyEventArea, so they ask the server for the same rows. The entries stay
 * literal rather than generated from SUBURBS for two reasons: the Deno test in
 * supabase/functions/_shared/savedSearchMatch.test.ts reads the slugs out of
 * this file's source, and importing suburbs.ts would pull the neighborhood
 * copy into every event card that imports this module.
 *
 * A suburb area matches by PLACE, not substring: `city` first, and only when
 * `city` is null, a location that ENDS in ", Urbandale" or ", Urbandale, IA
 * ...". "4000 Urbandale Ave, Des Moines" is a Des Moines row. Des Moines itself
 * keeps the plain city match it has always had on the hub.
 *
 * BBOX PROVENANCE. Each box was drawn from street geography and then checked
 * against the known_venues seed coordinates
 * (supabase/migrations/20260203000000_known_venues.sql and
 * 20260203000001_add_more_known_venues.sql, the rows knownVenues.ts loads);
 * src/lib/__tests__/eventAreas.test.ts pins which venues fall inside which box.
 * Valley Junction has NO known venue inside it in the seed (Val Air Ballroom's
 * seeded point, -93.7494, falls well west of the district), so that box is
 * checked against the street grid only.
 */

export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface EventAreaBase {
  /** URL value, e.g. `?area=east-village`. */
  slug: string;
  label: string;
}

export interface CityEventArea extends EventAreaBase {
  kind: "city";
  /** Matched against events.city, case-insensitive, whole value. */
  city: string;
  /**
   * Also match a row with a null city whose location ends in ", <city>" (a
   * suburb page's rule). Off for Des Moines, whose hub filter never read
   * location.
   */
  locationFallback?: boolean;
}

export interface BBoxEventArea extends EventAreaBase {
  kind: "bbox";
  bbox: GeoBBox;
}

export type EventArea = CityEventArea | BBoxEventArea;

export const EVENT_AREAS: readonly EventArea[] = [
  { slug: "des-moines", label: "Des Moines", kind: "city", city: "Des Moines" },
  { slug: "west-des-moines", label: "West Des Moines", kind: "city", city: "West Des Moines", locationFallback: true },
  { slug: "ankeny", label: "Ankeny", kind: "city", city: "Ankeny", locationFallback: true },
  { slug: "urbandale", label: "Urbandale", kind: "city", city: "Urbandale", locationFallback: true },
  { slug: "clive", label: "Clive", kind: "city", city: "Clive", locationFallback: true },
  { slug: "johnston", label: "Johnston", kind: "city", city: "Johnston", locationFallback: true },
  { slug: "altoona", label: "Altoona", kind: "city", city: "Altoona", locationFallback: true },
  { slug: "windsor-heights", label: "Windsor Heights", kind: "city", city: "Windsor Heights", locationFallback: true },
  { slug: "waukee", label: "Waukee", kind: "city", city: "Waukee", locationFallback: true },
  {
    // West bank of the Des Moines River to MLK Jr Pkwy, Principal Park to I-235.
    slug: "downtown",
    label: "Downtown / Court Ave",
    kind: "bbox",
    bbox: { south: 41.579, west: -93.6425, north: 41.596, east: -93.617 },
  },
  {
    // East bank of the river to E 14th St, south of I-235.
    slug: "east-village",
    label: "East Village",
    kind: "bbox",
    bbox: { south: 41.583, west: -93.617, north: 41.596, east: -93.6 },
  },
  {
    // Historic West Des Moines: 1st to 9th St, Railroad Ave to Grand Ave.
    slug: "valley-junction",
    label: "Valley Junction",
    kind: "bbox",
    bbox: { south: 41.568, west: -93.718, north: 41.576, east: -93.704 },
  },
  {
    // Ingersoll Ave and Grand Ave corridor, 28th St to 45th St.
    slug: "ingersoll",
    label: "Ingersoll",
    kind: "bbox",
    bbox: { south: 41.579, west: -93.673, north: 41.5875, east: -93.645 },
  },
];

export function findEventArea(slug: string | null | undefined): EventArea | undefined {
  if (!slug) return undefined;
  return EVENT_AREAS.find((area) => area.slug === slug);
}

export function isInBBox(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  bbox: GeoBBox
): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return (
    latitude >= bbox.south &&
    latitude <= bbox.north &&
    longitude >= bbox.west &&
    longitude <= bbox.east
  );
}

/**
 * The location endings a suburb's no-city rows are matched on, as ilike
 * patterns. Anchored at the end so a street named for the suburb elsewhere in
 * the address does not match.
 */
function locationPatterns(city: string): string[] {
  return [`%, ${city}`, `%, ${city}, IA%`, `%, ${city}, Iowa%`];
}

/** locationPatterns, for rows in hand: the same three shapes, case aside. */
function locationEndsInCity(location: string | null | undefined, city: string): boolean {
  const value = (location ?? "").toLowerCase();
  const c = city.toLowerCase();
  return value.endsWith(`, ${c}`) || value.includes(`, ${c}, ia`) || value.includes(`, ${c}, iowa`);
}

/**
 * The PostgREST `or` group for a suburb area: the city, or a null city with
 * a location ending in the suburb. Values holding a comma are double-quoted,
 * as PostgREST's logic-tree syntax requires. Null for areas that are not a
 * suburb (a bbox, or Des Moines).
 */
export function eventAreaOrFilter(area: EventArea): string | null {
  if (area.kind !== "city" || !area.locationFallback) return null;
  const locations = locationPatterns(area.city)
    .map((pattern) => `location.ilike."${pattern}"`)
    .join(",");
  return `city.ilike.${area.city},and(city.is.null,or(${locations}))`;
}

/** Client-side check, for rows already loaded (map pins, RPC results). */
export function eventInArea(
  event: {
    city?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  area: EventArea
): boolean {
  if (area.kind === "city") {
    if ((event.city ?? "").trim().toLowerCase() === area.city.toLowerCase()) return true;
    // Null only, as the server's `city.is.null`: an empty string is a city.
    if (!area.locationFallback || event.city != null) return false;
    return locationEndsInCity(event.location, area.city);
  }
  return isInBBox(event.latitude, event.longitude, area.bbox);
}

/** The methods an area filter calls; see applyEventVisibility in eventQuery.ts. */
interface AreaChain {
  ilike(column: string, pattern: string): AreaChain;
  or(filter: string): AreaChain;
  gte(column: string, value: number): AreaChain;
  lte(column: string, value: number): AreaChain;
}

/**
 * Add an area's predicates to an events query. A city is an `ilike` with no
 * wildcard, so it is a case-insensitive exact match; the city names carry no
 * `%` or `_`, so nothing needs escaping. A suburb adds eventAreaOrFilter's
 * group as its own `or=` param. A caller that already sends an `or=` and
 * wants a single one can nest eventAreaOrFilter(area) in its own group
 * instead of calling this.
 *
 * Shallow constraint plus a cast, for the TS2589 reason documented on
 * applyEventVisibility; every builder method used returns the builder itself.
 */
export function applyEventArea<Q extends { ilike: unknown; gte: unknown; lte: unknown }>(
  query: Q,
  area: EventArea
): Q {
  const chain = query as unknown as AreaChain;
  if (area.kind === "city") {
    const group = eventAreaOrFilter(area);
    if (group) return chain.or(group) as unknown as Q;
    return chain.ilike("city", area.city) as unknown as Q;
  }
  const { south, west, north, east } = area.bbox;
  return chain
    .gte("latitude", south)
    .lte("latitude", north)
    .gte("longitude", west)
    .lte("longitude", east) as unknown as Q;
}
