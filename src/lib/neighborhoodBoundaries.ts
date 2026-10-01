/**
 * SEO-060 - which neighbourhood a restaurant is in, from its coordinates.
 *
 * restaurants.city holds the municipality, so "Des Moines" covers downtown,
 * the East Village and Beaverdale alike, and nothing on the row said which.
 * The /<cuisine>/downtown, /east-village and /valley-junction pSEO pages
 * filtered on a name that no row carries and listed nothing. This module
 * draws each neighbourhood as a polygon; scripts/assign-restaurant-
 * neighborhoods.ts writes the result to restaurants.neighborhood, and the
 * listing filter reads that column.
 *
 * SOURCES. Each polygon traces a published street boundary; the vertex
 * coordinates are mine, placed on those streets from the geocoded addresses
 * of restaurants on them (e.g. 18th St from 644 18th St, the river between
 * 200 SW 2nd St on the west bank and 101 E Locust St on the east bank).
 *
 *   downtown         City of Des Moines definition, as quoted on Wikipedia
 *                    "Downtown Des Moines": "between the Des Moines River to the
 *                    east, the Raccoon River to the south, Center Street to the
 *                    north, and 18th and 15th Streets to the west". Read as
 *                    18th St south of Woodland Ave and 15th St north of it,
 *                    which is where Sherman Hill begins. East of the river is
 *                    the East Village, not downtown, so the two never overlap.
 *   east-village     Wikipedia "East Village, Des Moines": "bounded by
 *                    Interstate 235 on the north, the Des Moines River on the
 *                    west and south, and East 14th Street on the east".
 *   sherman-hill     Wikipedia "Sherman Hill Historic District" (NRHP):
 *                    "Roughly bounded by Woodland Ave., 19th, School, and 15th
 *                    Sts."
 *   valley-junction  NO NEIGHBOURHOOD BOUNDARY IS PUBLISHED. SEO-061 fetched
 *                    valleyjunction.com (home, "Valley Junction History",
 *                    "Getting Around", 2026-10-01): the Foundation states no
 *                    boundary, only that the original 40 acres lay "east of
 *                    8th Street", that 5th Street "runs up the middle of the
 *                    commercial district", and the arch at Fifth and
 *                    Railroad; its neighbourhood map is an image. The one
 *                    stated boundary is the NRHP Valley Junction Commercial
 *                    Historic District (Wikipedia, listed 2017-10-11):
 *                    "100-318 5th St. (even side 300 only) & cross streets",
 *                    "most of three blocks of Fifth Street and parts of two
 *                    cross streets". That is a historic district, not the
 *                    shopping district the pages mean, and its cross-street
 *                    extent is not stated, so it is not used: it would drop
 *                    St. Kilda (333 5th St) and cannot be drawn without
 *                    guessing. The NRHP strip lies wholly inside this box.
 *                    The box stays: Grand Ave north, Railroad Ave south,
 *                    1st St east, 8th St west. Treat it as provisional.
 *
 * Drake, Beaverdale and Ingersoll are taxonomy locations without a polygon
 * here: no published cuisine page uses them, and no boundary was verified.
 * A restaurant there gets neighborhood NULL, which lists it nowhere rather
 * than somewhere wrong.
 *
 * A point on a boundary street can land on either side; that is the precision
 * of a geocode against a street centreline, and it is why the assignment
 * script prints every row it places for review.
 */

/** [latitude, longitude] */
export type LatLng = readonly [number, number];

export interface NeighborhoodBoundary {
  /** Taxonomy location slug (src/pseo/taxonomy.ts) and the value stored in restaurants.neighborhood. */
  slug: string;
  name: string;
  /** The municipality the neighbourhood sits in; a row whose address names another city is not placed. */
  cities: readonly string[];
  /** The city as a reader names it, for page copy. */
  cityLabel: string;
  /** The boundary in words, for page copy that says what the list covers. */
  boundaryText: string;
  source: string;
  /** Closed ring, vertices in order; the last vertex joins the first. */
  polygon: readonly LatLng[];
}

export const NEIGHBORHOOD_BOUNDARIES: readonly NeighborhoodBoundary[] = [
  {
    slug: 'downtown',
    name: 'Downtown Des Moines',
    cities: ['des moines', 'downtown des moines'],
    cityLabel: 'Des Moines',
    boundaryText: 'west of the Des Moines River, north of the Raccoon River, south of Center Street and east of 15th and 18th Streets',
    source: 'https://en.wikipedia.org/wiki/Downtown_Des_Moines (City of Des Moines definition)',
    polygon: [
      [41.5935, -93.6362], // Center St x 15th St
      [41.5935, -93.6182], // Center St x Des Moines River
      [41.588, -93.617], // river, Grand Ave
      [41.583, -93.6168], // river, Court Ave
      [41.5795, -93.616], // Raccoon River confluence
      [41.579, -93.625], // Raccoon River
      [41.5785, -93.635],
      [41.578, -93.642], // Raccoon River x 18th St
      [41.588, -93.642], // 18th St x Woodland Ave
      [41.588, -93.6362], // Woodland Ave x 15th St
    ],
  },
  {
    slug: 'east-village',
    name: 'East Village',
    cities: ['des moines'],
    cityLabel: 'Des Moines',
    boundaryText: 'east of the Des Moines River, south of I-235 and west of East 14th Street',
    source: 'https://en.wikipedia.org/wiki/East_Village,_Des_Moines',
    polygon: [
      [41.5985, -93.6195], // I-235 x Des Moines River
      [41.5985, -93.599], // I-235 x E 14th St
      [41.577, -93.599], // E 14th St x Des Moines River
      [41.578, -93.61], // river
      [41.579, -93.615],
      [41.583, -93.6168], // river, Court Ave
      [41.588, -93.617], // river, Grand Ave
      [41.5935, -93.6182],
    ],
  },
  {
    slug: 'sherman-hill',
    name: 'Sherman Hill',
    cities: ['des moines'],
    cityLabel: 'Des Moines',
    boundaryText: 'between Woodland Avenue, School Street, 15th Street and 19th Street',
    source: 'https://en.wikipedia.org/wiki/Sherman_Hill_Historic_District',
    polygon: [
      [41.5925, -93.6432], // School St x 19th St
      [41.5925, -93.6362], // School St x 15th St
      [41.588, -93.6362], // Woodland Ave x 15th St
      [41.588, -93.6432], // Woodland Ave x 19th St
    ],
  },
  {
    slug: 'valley-junction',
    name: 'Valley Junction',
    cities: ['west des moines', 'valley junction'],
    cityLabel: 'West Des Moines',
    boundaryText: 'between Grand Avenue, Railroad Avenue, 1st Street and 8th Street',
    source: 'Provisional: 5th Street business district, Grand Ave / Railroad Ave / 1st St / 8th St (no published neighbourhood boundary; NRHP commercial district 100-318 5th St lies inside)',
    polygon: [
      [41.578, -93.7135], // Grand Ave x 8th St
      [41.578, -93.702], // Grand Ave x 1st St
      [41.568, -93.702], // Railroad Ave x 1st St
      [41.568, -93.7135], // Railroad Ave x 8th St
    ],
  },
];

export const NEIGHBORHOOD_SLUGS: readonly string[] = NEIGHBORHOOD_BOUNDARIES.map((n) => n.slug);

export function isNeighborhoodSlug(slug: string | undefined | null): boolean {
  return Boolean(slug && NEIGHBORHOOD_SLUGS.includes(slug));
}

/** Ray casting. Points exactly on an edge may fall either way. */
export function pointInPolygon([lat, lng]: LatLng, polygon: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** The city an address names ("..., West Des Moines, IA 50265"), lower-cased, or null. */
export function addressCity(location: string | null | undefined): string | null {
  const m = /,\s*([^,]+?),\s*IA\b/i.exec(location ?? '');
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * The neighbourhood slug for a point, or null. When the row's address names a
 * city, it has to be one the neighbourhood is in: a downtown fallback
 * coordinate on an Ankeny address is a bad geocode, not a downtown restaurant.
 */
export function neighborhoodFor(lat: number | null, lng: number | null, location?: string | null): string | null {
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const city = addressCity(location);
  for (const n of NEIGHBORHOOD_BOUNDARIES) {
    if (!pointInPolygon([lat, lng], n.polygon)) continue;
    if (city !== null && !n.cities.includes(city)) return null;
    return n.slug;
  }
  return null;
}
