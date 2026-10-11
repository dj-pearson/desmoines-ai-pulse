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

/**
 * The city-wide cuisine pages, /restaurants/<cuisine> (content-category rows):
 * every category slug whose listing filter selects restaurants. They hit the
 * same trap SEO-065 fixed for areas - /restaurants/italian looked for a
 * restaurant called "italian" and answered 404 + noindex - and nobody had
 * looked, because SEO-065 named only the area slugs. Five were published and
 * unreachable on 2026-10-10 (italian, mexican, asian, bbq, brunch), against
 * Des Moines-Ames searches of 3,600/mo for "italian restaurant des moines".
 *
 * A literal for the same three readers as RESTAURANT_AREA_SLUGS;
 * src/pseo/__tests__/restaurantAreaSlugs.test.ts fails when it drifts from the
 * restaurant entries in listingFilters.ts CATEGORY_FILTERS.
 */
export const RESTAURANT_CUISINE_SLUGS: readonly string[] = [
  'asian',
  'bbq',
  'brunch',
  'coffee',
  'italian',
  'mexican',
  'pizza',
  'steakhouse',
];

/**
 * A second segment under /restaurants/ that may be a pSEO page rather than a
 * restaurant: an area or a cuisine. A restaurant with the slug still wins.
 */
export function isRestaurantPseoSlug(slug: string | undefined | null): boolean {
  return Boolean(slug && (RESTAURANT_AREA_SLUGS.includes(slug) || RESTAURANT_CUISINE_SLUGS.includes(slug)));
}
