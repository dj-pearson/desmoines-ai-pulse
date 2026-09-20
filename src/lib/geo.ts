/**
 * Geographic utility functions for distance calculations and location-based features.
 * Uses the Haversine formula for great-circle distance between two points on Earth.
 */

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_MILES = 3959;

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two geographic points using the Haversine formula.
 *
 * @param point1 - First coordinate (latitude, longitude)
 * @param point2 - Second coordinate (latitude, longitude)
 * @param unit - Distance unit: 'miles' (default) or 'km'
 * @returns Distance between the two points
 */
export function haversineDistance(
  point1: Coordinates,
  point2: Coordinates,
  unit: 'miles' | 'km' = 'miles'
): number {
  const dLat = toRadians(point2.latitude - point1.latitude);
  const dLon = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.latitude)) *
      Math.cos(toRadians(point2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const radius = unit === 'km' ? EARTH_RADIUS_KM : EARTH_RADIUS_MILES;

  return radius * c;
}

/**
 * Check if a point is within a given radius of a center point.
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusMiles: number
): boolean {
  return haversineDistance(center, point) <= radiusMiles;
}

/**
 * Sort items by distance from a reference point.
 * Items without coordinates are placed at the end.
 */
export function sortByDistance<T extends { latitude?: number | null; longitude?: number | null }>(
  items: T[],
  from: Coordinates
): T[] {
  return [...items].sort((a, b) => {
    const aHasCoords = a.latitude != null && a.longitude != null;
    const bHasCoords = b.latitude != null && b.longitude != null;

    if (!aHasCoords && !bHasCoords) return 0;
    if (!aHasCoords) return 1;
    if (!bHasCoords) return -1;

    const distA = haversineDistance(from, {
      latitude: a.latitude!,
      longitude: a.longitude!,
    });
    const distB = haversineDistance(from, {
      latitude: b.latitude!,
      longitude: b.longitude!,
    });

    return distA - distB;
  });
}

/**
 * Calculate a distance-based score for recommendations.
 * Closer items get higher scores, with a configurable decay curve.
 *
 * @param distance - Distance in miles
 * @param maxDistance - Maximum distance to consider (items beyond this get 0)
 * @param maxScore - Maximum score for items at distance 0
 * @returns Score between 0 and maxScore
 */
export function distanceScore(
  distance: number,
  maxDistance: number = 25,
  maxScore: number = 30
): number {
  if (distance >= maxDistance) return 0;
  // Exponential decay: closer = much higher score
  return maxScore * Math.exp(-distance / (maxDistance / 3));
}

// Des Moines city center coordinates for default reference
export const DES_MOINES_CENTER: Coordinates = {
  latitude: 41.5868,
  longitude: -93.625,
};

/**
 * The Des Moines metro, as a bounding box (WEB-SEO-037).
 *
 * WHAT THIS IS FOR. `playgrounds` holds 69 rows and 21 of them are in Oregon,
 * Washington, Colorado and Missouri - a Google Places import that went wide.
 * The hub, the hook, the detail page and the sitemap generator all had no
 * filter, so a third of sitemap-playgrounds.xml pointed at parks a Des Moines
 * reader cannot visit, on what SEO-014 records as the site's best-performing
 * module.
 *
 * A BOX ON EXISTING COLUMNS RATHER THAN A NEW is_active FLAG, which is the
 * other option WEB-SEO-037 AC3 offers. Adding a column means a migration, and
 * a reader that names a not-yet-applied column gets 42703 on the WHOLE select
 * - PostgREST fails the query, not the predicate - so /playgrounds would go
 * blank for the length of the deploy window. latitude and longitude are
 * already there, already populated by the import that caused this, and need
 * no window. useOutdoorsNearby reached the same conclusion for the same rows:
 * "proximity filtering drops them for free".
 *
 * THE BOX IS DELIBERATELY LOOSE. It reaches past the county line so a genuine
 * metro park never falls out on a rounding error: Waukee (-93.88), Altoona
 * (-93.46), Ankeny (41.73) and Indianola (41.36) are all comfortably inside,
 * Ames (42.03) is outside because it is not the metro, and the nearest of the
 * 21 strays is several hundred miles away. This is a sanity bound, not a
 * service-area definition.
 */
export const DES_MOINES_METRO_BOUNDS = {
  minLatitude: 41.2,
  maxLatitude: 42.0,
  minLongitude: -94.3,
  maxLongitude: -93.1,
} as const;

/**
 * Is this point inside the metro box?
 *
 * A row with NO COORDINATES counts as inside. We cannot place it, and dropping
 * a row for missing data would hide hand-curated parks that were added without
 * a lat/lng - the 21 strays all came from a Places import, which supplies
 * coordinates, so they are not the rows this ambiguity protects.
 */
export function isInMetro(
  latitude?: number | null,
  longitude?: number | null,
): boolean {
  if (latitude == null || longitude == null) return true;
  return (
    latitude >= DES_MOINES_METRO_BOUNDS.minLatitude &&
    latitude <= DES_MOINES_METRO_BOUNDS.maxLatitude &&
    longitude >= DES_MOINES_METRO_BOUNDS.minLongitude &&
    longitude <= DES_MOINES_METRO_BOUNDS.maxLongitude
  );
}
