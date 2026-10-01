/**
 * "Hotels near {venue}" (SEO-045, SEO-013): which hotels, in what order, and
 * whether the page is worth an index entry.
 *
 * THE QUESTION THIS ANSWERS is the one the operator scoped /stay to: "which
 * hotel is near the venue I just bought a ticket for". It is answered with a
 * straight line between two stored coordinates, nearest first, and every
 * surface that renders it says "straight-line". It is not a walking time or a
 * route, and nothing here calls a hotel walkable: a wrong walking distance is
 * the field a visitor acts on at 11pm.
 *
 * NO `@/` IMPORTS, on purpose. scripts/generate-dynamic-sitemaps.ts runs under
 * tsx without the Vite alias and imports this file to decide which
 * /stay/near/:slug pages to submit, so the page and the sitemap apply one rule.
 */
import { haversineDistance } from "./geo";

/** How far the page looks, in straight-line miles. Five covers a metro venue's own side of town. */
export const HOTELS_NEAR_MILES = 5;

/** Most hotels the page lists. */
export const HOTELS_NEAR_LIMIT = 12;

/**
 * Fewer hotels in range than this and the page is noindexed and left out of
 * the sitemap. One or two names is a thin page; the venue page's own card
 * already shows them.
 */
export const HOTELS_NEAR_MIN_INDEXABLE = 3;

export interface Located {
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/**
 * A usable coordinate pair, or null. PostgREST returns NUMERIC columns as
 * strings, so both are accepted. (0, 0) is refused: it is the Atlantic, and
 * what an unset numeric looks like after something coerced a null.
 */
export function coordinatesOf(p: Located | null | undefined): { latitude: number; longitude: number } | null {
  if (!p) return null;
  const latitude = p.latitude == null || p.latitude === "" ? NaN : Number(p.latitude);
  const longitude = p.longitude == null || p.longitude === "" ? NaN : Number(p.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/**
 * Items within `maxMiles` of `origin`, nearest first, each with its
 * straight-line distance in miles. An item without coordinates is left out,
 * not ranked last: an unknown distance is not "far". Ties keep input order.
 */
export function rankByDistance<T extends Located>(
  origin: Located | null | undefined,
  items: readonly T[],
  opts: { maxMiles: number; limit: number },
): Array<{ item: T; miles: number }> {
  const from = coordinatesOf(origin);
  if (!from) return [];
  return items
    .map((item, index) => {
      const at = coordinatesOf(item);
      return at ? { item, miles: haversineDistance(from, at), index } : null;
    })
    .filter((x): x is { item: T; miles: number; index: number } => !!x && x.miles <= opts.maxMiles)
    .sort((a, b) => a.miles - b.miles || a.index - b.index)
    .slice(0, opts.limit)
    .map(({ item, miles }) => ({ item, miles }));
}

/** The hotels a /stay/near/:slug page lists. */
export function hotelsNear<T extends Located>(venue: Located | null | undefined, hotels: readonly T[]) {
  return rankByDistance(venue, hotels, { maxMiles: HOTELS_NEAR_MILES, limit: HOTELS_NEAR_LIMIT });
}

/** Whether a near-page with this many hotels is indexed and submitted. */
export function isHotelsNearIndexable(count: number): boolean {
  return count >= HOTELS_NEAR_MIN_INDEXABLE;
}

export function hotelsNearPath(venueSlug: string): string {
  return `/stay/near/${venueSlug}`;
}
