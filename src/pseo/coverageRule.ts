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
 * SCOPE IS SUBURBS. restaurants.city carries the suburb name, so a count for
 * Ankeny or Waukee is a real count. Neighbourhoods (downtown, east-village,
 * valley-junction) are not in scope: no restaurant row names its
 * neighbourhood, the listing query matches none of them, and a zero there is
 * the filter's blind spot rather than a measurement. Those pages are reported,
 * not acted on.
 *
 * WHAT COUNTS AS A PLACE mirrors PseoLiveListings.fetchListings exactly:
 * not merged, a visitable status (closed, opening_soon and announced rows are
 * dropped by isVisitableStatus), city or location containing the area name,
 * cuisine matching the category pattern. The patterns come from
 * listingFilters.ts, the same module the component reads.
 *
 * The edge function generate-pseo-page cannot import this file (Deno, deployed
 * on its own), so supabase/functions/_shared/pseoCoverage.ts repeats the
 * thresholds and scope. scripts/check-pseo-coverage.ts fails when the two
 * disagree.
 */
import { CATEGORY_FILTERS } from './listingFilters';
import { isVisitableStatus } from '../lib/restaurantHours';

export const MIN_PLACES_TO_PUBLISH = 3;
export const MIN_PLACES_TO_INDEX = 5;

/** Taxonomy location slugs the rule governs: the suburbs, whose name is in restaurants.city. */
export const COVERAGE_LOCATIONS: readonly string[] = [
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

/** True for a category-location page whose category lists restaurants and whose location is a suburb. */
export function isCoverageScoped(pageTypeId: string, dimensions: readonly CoverageDimension[]): boolean {
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
}

/** Does this restaurant appear in the live listing for (area name, category)? */
export function placeMatches(row: CoverageRestaurantRow, locationName: string, categorySlug: string): boolean {
  const filter = CATEGORY_FILTERS[categorySlug];
  if (!filter || filter.entity !== 'restaurants') return false;
  // PostgREST .neq('is_merged', true) drops NULL as well as true.
  if (row.is_merged !== false) return false;
  if (!isVisitableStatus(row.status)) return false;
  const needle = locationName.toLowerCase();
  const inArea =
    (row.city ?? '').toLowerCase().includes(needle) || (row.location ?? '').toLowerCase().includes(needle);
  if (!inArea) return false;
  return new RegExp(filter.pattern, 'i').test(row.cuisine ?? '');
}

export function matchingPlaces<T extends CoverageRestaurantRow>(
  rows: readonly T[],
  locationName: string,
  categorySlug: string,
): T[] {
  return rows.filter((r) => placeMatches(r, locationName, categorySlug));
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
