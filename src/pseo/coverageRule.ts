/**
 * SEO-041 coverage rule for cuisine x area pSEO pages.
 *
 * A page like /mexican/waukee is only worth having if the area has the places
 * to fill it. The rule, counted in published places that the page's own live
 * listing would show:
 *
 *   fewer than 3   do not generate, do not publish (an existing page is
 *                  unpublished and 301'd in public/_redirects)
 *   3 or 4         may exist, but carries robots "noindex, follow" and stays
 *                  out of sitemap-pseo.xml
 *   5 or more      indexable, submitted in sitemap-pseo.xml
 *
 * plus one condition the count cannot see (SEO-017's warning): two indexable
 * pages whose listings are the SAME restaurants are one page under two URLs.
 * The later one in slug order is held to noindex. /pizza/ankeny and
 * /italian/ankeny list the same three places today, which is the case.
 *
 * SEO-065 puts the all-restaurants area page (/restaurants/ankeny) under the
 * same rule; see AREA_PAGE_CATEGORY.
 *
 * SCOPE: SUBURBS AND MAPPED NEIGHBOURHOODS. restaurants.city carries the
 * suburb name, so a count for Ankeny or Waukee is a text match. A
 * neighbourhood (downtown, east-village, valley-junction, sherman-hill) is
 * counted on restaurants.neighborhood, assigned from lat/lng (SEO-060; see
 * src/lib/neighborhoodBoundaries.ts). Before that column existed no row named
 * its neighbourhood and those pages were reported, not acted on.
 *
 * WHAT COUNTS AS A PLACE mirrors PseoLiveListings.fetchListings exactly:
 * not merged, a visitable status (closed, opening_soon and announced rows are
 * dropped by isVisitableStatus), in the area (restaurantLocationMatch: the
 * neighbourhood column, or city/location containing the suburb name),
 * cuisine matching the category pattern. The patterns come from
 * listingFilters.ts, the same module the component reads.
 *
 * The edge function generate-pseo-page cannot import this file (Deno, deployed
 * on its own), so supabase/functions/_shared/pseoCoverage.ts repeats the
 * thresholds and scope. scripts/check-pseo-coverage.ts fails when the two
 * disagree.
 */
import { CATEGORY_FILTERS, restaurantLocationMatch } from './listingFilters';
import { NEIGHBORHOOD_SLUGS } from '../lib/neighborhoodBoundaries';
import { isVisitableStatus } from '../lib/restaurantHours';

export const MIN_PLACES_TO_PUBLISH = 3;
export const MIN_PLACES_TO_INDEX = 5;

/**
 * Taxonomy location slugs the rule governs: the mapped neighbourhoods
 * (restaurants.neighborhood) and the suburbs, whose name is in restaurants.city.
 */
export const COVERAGE_LOCATIONS: readonly string[] = [
  ...NEIGHBORHOOD_SLUGS,
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

/** Category slugs that list restaurants, read from the listing filters. */
export const COVERAGE_CATEGORIES: readonly string[] = Object.entries(CATEGORY_FILTERS)
  .filter(([, f]) => f.entity === 'restaurants')
  .map(([slug]) => slug)
  .sort();

/**
 * SEO-065: the all-restaurants area page, /restaurants/<area>. It sits in the
 * category slot of a coverage row so the slug template (`/${category}/${area}`)
 * and the thresholds apply unchanged, and it is counted with no cuisine
 * filter, which is what its live listing shows (a content-location page has
 * no category dimension). It is a content type, not a cuisine: it is never in
 * COVERAGE_CATEGORIES, and the edge function's copy does not govern it.
 */
export const AREA_PAGE_CATEGORY = 'restaurants';

/** Every category slot the rule measures: the area page, then each cuisine. */
export const COVERAGE_PAGE_CATEGORIES: readonly string[] = [AREA_PAGE_CATEGORY, ...COVERAGE_CATEGORIES];

/**
 * The city-wide cuisine page, /restaurants/<cuisine> (content-category), has
 * no area: its live listing is every restaurant in the directory whose cuisine
 * matches. It is measured in the location slot as CITYWIDE so the same rows,
 * thresholds and duplicate condition apply. Not a taxonomy slug, and never a
 * URL segment: the slug is /restaurants/<cuisine>.
 */
export const CITYWIDE = '';
export const CITYWIDE_NAME = 'Des Moines';

export function citywideSlug(categorySlug: string): string {
  return `/${AREA_PAGE_CATEGORY}/${categorySlug}`;
}

export type CoverageVerdict = 'not-generated' | 'noindex' | 'indexable';

export function coverageVerdict(placeCount: number): CoverageVerdict {
  if (placeCount < MIN_PLACES_TO_PUBLISH) return 'not-generated';
  if (placeCount < MIN_PLACES_TO_INDEX) return 'noindex';
  return 'indexable';
}

export interface CoverageDimension {
  dimension: string;
  slug: string;
  name: string;
}

/**
 * True for a category-location page whose category lists restaurants and whose
 * location is a coverage area, and (SEO-065) for the content-location page
 * /restaurants/<area> over a coverage area.
 */
export function isCoverageScoped(pageTypeId: string, dimensions: readonly CoverageDimension[]): boolean {
  if (pageTypeId === 'content-category') {
    const content = dimensions.find((d) => d.dimension === 'content_type');
    const category = dimensions.find((d) => d.dimension === 'category');
    return Boolean(content?.slug === AREA_PAGE_CATEGORY && category && COVERAGE_CATEGORIES.includes(category.slug));
  }
  if (pageTypeId === 'content-location') {
    const content = dimensions.find((d) => d.dimension === 'content_type');
    const area = dimensions.find((d) => d.dimension === 'location');
    return Boolean(content?.slug === AREA_PAGE_CATEGORY && area && COVERAGE_LOCATIONS.includes(area.slug));
  }
  if (pageTypeId !== 'category-location') return false;
  const category = dimensions.find((d) => d.dimension === 'category');
  const location = dimensions.find((d) => d.dimension === 'location');
  return Boolean(
    category && location && COVERAGE_CATEGORIES.includes(category.slug) && COVERAGE_LOCATIONS.includes(location.slug),
  );
}

export interface CoverageRestaurantRow {
  id: string;
  name: string;
  city: string | null;
  location: string | null;
  cuisine: string | null;
  status: string | null;
  is_merged: boolean | null;
  /** SEO-060. Optional so a row read without it simply matches no neighbourhood. */
  neighborhood?: string | null;
}

/** An area as a page names it: the taxonomy slug and the display name stored on the row. */
export interface CoverageArea {
  slug: string;
  name: string;
}

/**
 * Does this restaurant appear in the live listing for (area, category)? A bare
 * string is a suburb name, matched as text.
 */
export function placeMatches(row: CoverageRestaurantRow, area: CoverageArea | string, categorySlug: string): boolean {
  const isAreaPage = categorySlug === AREA_PAGE_CATEGORY;
  const filter = CATEGORY_FILTERS[categorySlug];
  if (!isAreaPage && (!filter || filter.entity !== 'restaurants')) return false;
  // PostgREST .neq('is_merged', true) drops NULL as well as true.
  if (row.is_merged !== false) return false;
  if (!isVisitableStatus(row.status)) return false;
  // CITYWIDE: the content-category listing applies no location filter.
  // Every real area carries a taxonomy slug; only CITYWIDE has none.
  const citywide = typeof area === 'string' ? area === CITYWIDE : area.slug === CITYWIDE;
  if (citywide) {
    if (isAreaPage) return true;
    return new RegExp(filter.pattern, 'i').test(row.cuisine ?? '');
  }
  const match = restaurantLocationMatch(typeof area === 'string' ? { slug: '', name: area } : area);
  if (match.kind === 'neighborhood') {
    if (row.neighborhood !== match.slug) return false;
  } else {
    const needle = match.name.toLowerCase();
    const inArea =
      (row.city ?? '').toLowerCase().includes(needle) || (row.location ?? '').toLowerCase().includes(needle);
    if (!inArea) return false;
  }
  if (isAreaPage) return true;
  return new RegExp(filter.pattern, 'i').test(row.cuisine ?? '');
}

export function matchingPlaces<T extends CoverageRestaurantRow>(
  rows: readonly T[],
  area: CoverageArea | string,
  categorySlug: string,
): T[] {
  return rows.filter((r) => placeMatches(r, area, categorySlug));
}

/** The listing's identity, independent of order: sorted ids. */
export function listingFingerprint(rows: readonly { id: string }[]): string {
  return rows
    .map((r) => r.id)
    .sort()
    .join('|');
}

export interface CoverageCandidate {
  slug: string;
  places: number;
  fingerprint: string;
}

/**
 * Applies the duplicate condition on top of the count. Of several candidates
 * that would be indexable with an identical listing, the first by slug keeps
 * its verdict and the rest drop to noindex. Pure, so it is testable.
 */
export function finalVerdicts(candidates: readonly CoverageCandidate[]): Map<string, CoverageVerdict> {
  const out = new Map<string, CoverageVerdict>();
  const seen = new Set<string>();
  for (const c of [...candidates].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const base = coverageVerdict(c.places);
    if (base === 'indexable' && seen.has(c.fingerprint)) {
      out.set(c.slug, 'noindex');
      continue;
    }
    if (base === 'indexable') seen.add(c.fingerprint);
    out.set(c.slug, base);
  }
  return out;
}
