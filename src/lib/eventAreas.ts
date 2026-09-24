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
}

export interface BBoxEventArea extends EventAreaBase {
  kind: "bbox";
  bbox: GeoBBox;
}

export type EventArea = CityEventArea | BBoxEventArea;

export const EVENT_AREAS: readonly EventArea[] = [
  { slug: "des-moines", label: "Des Moines", kind: "city", city: "Des Moines" },
  { slug: "west-des-moines", label: "West Des Moines", kind: "city", city: "West Des Moines" },
  { slug: "ankeny", label: "Ankeny", kind: "city", city: "Ankeny" },
  { slug: "urbandale", label: "Urbandale", kind: "city", city: "Urbandale" },
  { slug: "clive", label: "Clive", kind: "city", city: "Clive" },
  { slug: "johnston", label: "Johnston", kind: "city", city: "Johnston" },
  { slug: "altoona", label: "Altoona", kind: "city", city: "Altoona" },
  { slug: "windsor-heights", label: "Windsor Heights", kind: "city", city: "Windsor Heights" },
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

/** Client-side check, for rows already loaded (map pins, RPC results). */
export function eventInArea(
  event: { city?: string | null; latitude?: number | null; longitude?: number | null },
  area: EventArea
): boolean {
  if (area.kind === "city") {
    return (event.city ?? "").trim().toLowerCase() === area.city.toLowerCase();
  }
  return isInBBox(event.latitude, event.longitude, area.bbox);
}

/** The methods an area filter calls; see applyEventVisibility in eventQuery.ts. */
interface AreaChain {
  ilike(column: string, pattern: string): AreaChain;
  gte(column: string, value: number): AreaChain;
  lte(column: string, value: number): AreaChain;
}

/**
 * Add an area's predicates to an events query. A city is an `ilike` with no
 * wildcard, so it is a case-insensitive exact match; the city names carry no
 * `%` or `_`, so nothing needs escaping.
 *
 * Shallow constraint plus a cast, for the TS2589 reason documented on
 * applyEventVisibility; every builder method used returns the builder itself.
 */
export function applyEventArea<Q extends { ilike: unknown; gte: unknown; lte: unknown }>(
  query: Q,
  area: EventArea
): Q {
  const chain = query as unknown as AreaChain;
  if (area.kind === "city") return chain.ilike("city", area.city) as unknown as Q;
  const { south, west, north, east } = area.bbox;
  return chain
    .gte("latitude", south)
    .lte("latitude", north)
    .gte("longitude", west)
    .lte("longitude", east) as unknown as Q;
}
