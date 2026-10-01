/**
 * SEO-065: the second segments under /restaurants/ that may be an area pSEO
 * page rather than a restaurant, i.e. every taxonomy location slug.
 *
 * /restaurants/:slug is the restaurant detail route, and React Router ranks it
 * above the generic pSEO catch-all, so /restaurants/ankeny used to look for a
 * restaurant called "ankeny", find none and answer 404. A restaurant with the
 * slug still wins (RestaurantDetails tries it first); only a miss on one of
 * these slugs falls back to the published pseo_pages row, and a slug with no
 * published row is still a 404.
 *
 * Kept as a plain literal, with no imports, because three readers need it:
 *   src/pages/RestaurantDetails.tsx    the client fallback
 *   functions/_middleware.ts           the edge shell for an un-prerendered URL
 *   scripts/lib/pseoRouteClaims.mjs    reads this file as TEXT, so the route
 *                                      audit and the sitemap stop treating
 *                                      these slugs as claimed by the detail
 *                                      route
 * src/pseo/__tests__/restaurantAreaSlugs.test.ts fails when it drifts from
 * locationDimension in taxonomy.ts.
 */
export const RESTAURANT_AREA_SLUGS: readonly string[] = [
  'downtown',
  'east-village',
  'valley-junction',
  'drake',
  'beaverdale',
  'sherman-hill',
  'ingersoll',
  'west-des-moines',
  'ankeny',
  'urbandale',
  'johnston',
  'altoona',
  'clive',
  'waukee',
  'pleasant-hill',
  'windsor-heights',
];

export function isRestaurantAreaSlug(slug: string | undefined | null): boolean {
  return Boolean(slug && RESTAURANT_AREA_SLUGS.includes(slug));
}
