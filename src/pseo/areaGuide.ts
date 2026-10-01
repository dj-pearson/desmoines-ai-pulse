/**
 * SEO-040 - the data behind a neighbourhood area guide (/things-to-do/east-village).
 *
 * The page used to be LLM copy: eight "top picks", insider tips and an FAQ
 * that quoted meter hours ("free after 6pm") in one section and a different
 * rule ("free after 5pm") on the date-night page, with nothing in the repo or
 * the database to back either. Everything the guide now shows comes from rows:
 *
 *   restaurants and bars   restaurants.neighborhood (SEO-060, assigned from
 *                          lat/lng against src/lib/neighborhoodBoundaries.ts)
 *   what's on              events whose stored coordinates fall inside the
 *                          same polygon
 *
 * Pure functions, no React and no Supabase client, so they are unit-tested
 * directly (src/pseo/__tests__/areaGuide.test.ts).
 */
import {
  NEIGHBORHOOD_BOUNDARIES,
  pointInPolygon,
  type LatLng,
  type NeighborhoodBoundary,
} from '../lib/neighborhoodBoundaries';
import { isVisitableStatus } from '../lib/restaurantHours';

/**
 * pSEO pages that render as an area guide. For these, PseoPage ignores the
 * row's stored sections and description (LLM copy) and renders the intro below
 * plus PseoAreaGuide. Chosen here rather than by rewriting the row so the
 * switch ships with the code that renders it: a row rewritten ahead of the
 * deploy left the live page as an h1 and two sentences. /things-to-do/east-village
 * is the winner of SEO-040's East Village pair (1,208 impressions, position 11.8).
 */
export const AREA_GUIDE_SLUGS: ReadonlySet<string> = new Set(['/things-to-do/east-village']);

/** Two sentences, each checkable: the boundary's published definition, then what the page holds. */
export function areaGuideIntro(boundary: NeighborhoodBoundary): string {
  return (
    `The ${boundary.name} is the ${boundary.cityLabel} neighborhood ${boundary.boundaryText}. ` +
    `Below are the restaurants and bars we list inside that boundary, what's on there this week, ` +
    `where to park and a map of every place on the page.`
  );
}

export function areaGuideDescription(boundary: NeighborhoodBoundary): string {
  return (
    `Restaurants, bars and what's on this week in the ${boundary.name}, ${boundary.cityLabel}, ` +
    `with parking and a map. Every place listed sits inside the neighborhood boundary.`
  );
}

/** How many places each list shows. The story asks for 8-10 restaurants. */
export const AREA_RESTAURANT_LIMIT = 10;
export const AREA_BAR_LIMIT = 10;

/** "What's on this week" is the next seven days from now. */
export const AREA_WEEK_DAYS = 7;
/** Read this far ahead so a quiet week can still show what comes next. */
export const AREA_LOOKAHEAD_DAYS = 30;
/** Below this many this-week events, the page also lists the next few. */
export const AREA_MIN_WEEK_EVENTS = 3;
export const AREA_LATER_LIMIT = 5;

/**
 * A place counts as a bar when its cuisine says so. The column is the only
 * evidence we hold: "Bar & Grill" is how the table records Zombie Burger,
 * The Continental and Quinton's. A name containing "bar" proves nothing
 * (Bar Nico is a Mexican restaurant, Ceviche Bar is recorded as American).
 */
const BAR_CUISINE = /\b(bar|pub|tavern|brewery|brewpub|brewing|taproom|lounge|wine|cocktails?|speakeasy)\b/i;

export function isBarCuisine(cuisine: string | null | undefined): boolean {
  return Boolean(cuisine && BAR_CUISINE.test(cuisine));
}

export function boundaryForLocation(slug: string | undefined | null): NeighborhoodBoundary | undefined {
  if (!slug) return undefined;
  return NEIGHBORHOOD_BOUNDARIES.find((b) => b.slug === slug);
}

/** The polygon's bounding box, used to narrow the events query before the exact test. */
export function polygonBounds(polygon: readonly LatLng[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const lats = polygon.map((p) => p[0]);
  const lngs = polygon.map((p) => p[1]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

export interface AreaPlaceRow {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  price_range: string | null;
  rating: number | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * One key per physical place. The table holds the same taproom twice
 * ("Iowa Taproom" and "The Iowa Taproom", one coordinate), and listing both
 * would be a list padded by a duplicate.
 */
function placeKey(row: AreaPlaceRow): string {
  const name = row.name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
  const at =
    row.latitude != null && row.longitude != null
      ? `${Number(row.latitude).toFixed(4)},${Number(row.longitude).toFixed(4)}`
      : '';
  return `${name}@${at}`;
}

/**
 * Rows arrive highest-rated first. Drops places that are closed or not open
 * yet, collapses duplicates, then splits bars from restaurants.
 */
export function splitAreaPlaces(rows: readonly AreaPlaceRow[]): {
  restaurants: AreaPlaceRow[];
  bars: AreaPlaceRow[];
  total: number;
} {
  const seen = new Set<string>();
  const unique: AreaPlaceRow[] = [];
  for (const row of rows) {
    if (!isVisitableStatus(row.status)) continue;
    const key = placeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  const bars = unique.filter((r) => isBarCuisine(r.cuisine));
  const restaurants = unique.filter((r) => !isBarCuisine(r.cuisine));
  return {
    restaurants: restaurants.slice(0, AREA_RESTAURANT_LIMIT),
    bars: bars.slice(0, AREA_BAR_LIMIT),
    total: unique.length,
  };
}

export interface AreaEventRow {
  id: string;
  title: string;
  date: string | null;
  event_start_utc: string | null;
  time_tbd: boolean | null;
  venue: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
}

function startMs(e: AreaEventRow): number {
  return Date.parse(e.event_start_utc ?? e.date ?? '');
}

/**
 * Events inside the polygon, split into the next seven days and, when that
 * week is thin, the few after it. An event with no stored coordinates is left
 * out: a venue name is not evidence of which side of the river it is on.
 */
export function splitAreaEvents(
  rows: readonly AreaEventRow[],
  polygon: readonly LatLng[],
  now: Date = new Date(),
): { thisWeek: AreaEventRow[]; later: AreaEventRow[] } {
  const weekEnd = now.getTime() + AREA_WEEK_DAYS * 86_400_000;
  const inside = rows
    .filter((e) => e.latitude != null && e.longitude != null)
    .filter((e) => pointInPolygon([Number(e.latitude), Number(e.longitude)], polygon))
    .filter((e) => Number.isFinite(startMs(e)) && startMs(e) >= now.getTime())
    .sort((a, b) => startMs(a) - startMs(b));
  const thisWeek = inside.filter((e) => startMs(e) < weekEnd);
  const later =
    thisWeek.length < AREA_MIN_WEEK_EVENTS
      ? inside.filter((e) => startMs(e) >= weekEnd).slice(0, AREA_LATER_LIMIT)
      : [];
  return { thisWeek, later };
}
