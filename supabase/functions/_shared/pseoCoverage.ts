/**
 * SEO-041 coverage rule, the edge function's copy.
 *
 * The rule and its reasoning live in src/pseo/coverageRule.ts. This file
 * repeats the parts generate-pseo-page needs, because a deployed function
 * cannot import from src/. scripts/check-pseo-coverage.ts compares the
 * thresholds, locations, cuisine patterns and statuses below with the src
 * copies and fails on any difference, so edit both or neither.
 *
 * Kept free of Deno APIs so the comparison can read it as text.
 */

export const MIN_PLACES_TO_PUBLISH = 3;
export const MIN_PLACES_TO_INDEX = 5;

/**
 * SEO-060: neighbourhoods are matched on restaurants.neighborhood (assigned
 * from lat/lng against src/lib/neighborhoodBoundaries.ts), not on the name.
 * Must equal NEIGHBORHOOD_SLUGS there; the check script compares them.
 */
export const NEIGHBORHOOD_LOCATIONS: readonly string[] = [
  'downtown',
  'east-village',
  'sherman-hill',
  'valley-junction',
];

export const COVERAGE_LOCATIONS: readonly string[] = [
  'downtown',
  'east-village',
  'sherman-hill',
  'valley-junction',
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

/** restaurants.cuisine patterns, as in src/pseo/listingFilters.ts CATEGORY_FILTERS. */
export const CUISINE_PATTERNS: Record<string, string> = {
  italian: 'italian|pizza',
  mexican: 'mexican|tex-?mex|latin',
  asian: 'asian|chinese|thai|japanese|sushi|vietnamese|korean|ramen',
  bbq: 'bbq|barbec|smokehouse',
  brunch: 'brunch|breakfast|caf|coffee|bakery|diner',
  coffee: 'coffee|caf|espresso',
  steakhouse: 'steak',
  pizza: 'pizz',
};

/** As src/lib/restaurantHours.ts: statuses you cannot eat at today. */
export const NOT_VISITABLE_STATUSES: ReadonlySet<string> = new Set([
  'closed',
  'opening_soon',
  'announced',
  'permanently_closed',
  'temporarily_closed',
  'closed_permanently',
  'closed_temporarily',
  'coming_soon',
]);

export type CoverageVerdict = 'not-generated' | 'noindex' | 'indexable';

export function coverageVerdict(placeCount: number): CoverageVerdict {
  if (placeCount < MIN_PLACES_TO_PUBLISH) return 'not-generated';
  if (placeCount < MIN_PLACES_TO_INDEX) return 'noindex';
  return 'indexable';
}

interface Dim {
  dimension: string;
  slug: string;
  name: string;
}

/** The category and location of a governed page, or null when the rule does not apply. */
export function coverageScope(pageTypeId: string, dimensions: readonly Dim[]): { category: Dim; location: Dim } | null {
  if (pageTypeId !== 'category-location') return null;
  const category = dimensions.find((d) => d.dimension === 'category');
  const location = dimensions.find((d) => d.dimension === 'location');
  if (!category || !location) return null;
  if (!(category.slug in CUISINE_PATTERNS) || !COVERAGE_LOCATIONS.includes(location.slug)) return null;
  return { category, location };
}

export interface CoverageRestaurantRow {
  neighborhood?: string | null;
  city: string | null;
  location: string | null;
  cuisine: string | null;
  status: string | null;
  is_merged: boolean | null;
}

/** Same predicate as src/pseo/coverageRule.ts placeMatches. */
export function countPlaces(rows: readonly CoverageRestaurantRow[], location: Dim, categorySlug: string): number {
  const pattern = CUISINE_PATTERNS[categorySlug];
  if (!pattern) return 0;
  const re = new RegExp(pattern, 'i');
  const byNeighborhood = NEIGHBORHOOD_LOCATIONS.includes(location.slug);
  const needle = location.name.toLowerCase();
  return rows.filter((r) => {
    if (r.is_merged !== false) return false;
    if (r.status && NOT_VISITABLE_STATUSES.has(r.status.trim().toLowerCase())) return false;
    const inArea = byNeighborhood
      ? r.neighborhood === location.slug
      : (r.city ?? '').toLowerCase().includes(needle) || (r.location ?? '').toLowerCase().includes(needle);
    return inArea && re.test(r.cuisine ?? '');
  }).length;
}
