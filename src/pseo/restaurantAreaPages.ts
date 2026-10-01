/**
 * Which cuisine x area pSEO pages a restaurant belongs on (SEO-034).
 *
 * A restaurant page links to /mexican/waukee only when that page would list
 * it, so the link is a real pair: the pSEO page's live listing links back.
 * Membership is the SEO-041 coverage rule's own predicate (placeMatches), not
 * a second reading of the cuisine, so the two cannot disagree about whether a
 * place belongs to a page.
 *
 * Whether the page is published and indexable is not knowable here; the
 * caller asks pseo_pages for these slugs (useRestaurantAreaPages) and keeps
 * the published ones without a noindex.
 *
 * Same scope as the rule: the suburbs (matched on city/address text) and the
 * mapped neighbourhoods (matched on restaurants.neighborhood, SEO-060).
 */
import { COVERAGE_CATEGORIES, COVERAGE_LOCATIONS, placeMatches, type CoverageRestaurantRow } from './coverageRule';

/**
 * "west-des-moines" -> "West Des Moines". The suburbs all title-case cleanly;
 * a neighbourhood is matched on its slug, so its name is never compared.
 */
export function coverageLocationName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Candidate pSEO slugs ("/mexican/waukee") whose listing this restaurant would appear in. */
export function areaPageCandidates(row: CoverageRestaurantRow): string[] {
  const out: string[] = [];
  for (const loc of COVERAGE_LOCATIONS) {
    const name = coverageLocationName(loc);
    for (const cat of COVERAGE_CATEGORIES) {
      if (placeMatches(row, { slug: loc, name }, cat)) out.push(`/${cat}/${loc}`);
    }
  }
  return out;
}

export interface PseoPageState {
  slug: string;
  is_published?: boolean | null;
  seo?: { robots?: string | null } | null;
  dimensions?: Array<{ dimension: string; name: string }> | null;
}

/** Published, no noindex: a page a crawler is meant to find. */
export function isIndexablePseoPage(page: PseoPageState): boolean {
  if (page.is_published === false) return false;
  return !/noindex/i.test(page.seo?.robots ?? '');
}

/**
 * "Mexican restaurants in Waukee", "Steakhouses in West Des Moines", from the
 * page's own dimension names. A name that is already a kind of place
 * ("Steakhouses", "Coffee & Cafes") takes no "restaurants".
 */
export function areaPageLabel(page: PseoPageState): string {
  const dims = page.dimensions ?? [];
  const category = dims.find((d) => d.dimension === 'category')?.name;
  const location = dims.find((d) => d.dimension === 'location')?.name;
  if (!category || !location) return page.slug;
  const noun = /(s|cafes)$/i.test(category) ? category : `${category} restaurants`;
  return `${noun} in ${location}`;
}
