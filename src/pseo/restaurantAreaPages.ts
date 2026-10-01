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
 * SEO-065 adds each area's all-restaurants page (/restaurants/waukee), which
 * every place in the area belongs on.
 *
 * Same scope as the rule: the suburbs (matched on city/address text) and the
 * mapped neighbourhoods (matched on restaurants.neighborhood, SEO-060).
 */
import {
  AREA_PAGE_CATEGORY,
  COVERAGE_PAGE_CATEGORIES,
  COVERAGE_LOCATIONS,
  isCoverageScoped,
  placeMatches,
  type CoverageRestaurantRow,
} from './coverageRule';

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

/**
 * Candidate pSEO slugs whose listing this restaurant would appear in: the
 * area's all-restaurants page first (/restaurants/waukee, SEO-065), then its
 * cuisine pages (/mexican/waukee).
 */
export function areaPageCandidates(row: CoverageRestaurantRow): string[] {
  const out: string[] = [];
  for (const loc of COVERAGE_LOCATIONS) {
    const name = coverageLocationName(loc);
    for (const cat of COVERAGE_PAGE_CATEGORIES) {
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
  // SEO-065: /restaurants/<area> has a content type where a cuisine page has a category.
  const content = dims.find((d) => d.dimension === 'content_type')?.name;
  if (!category && content && location) return `${content} in ${location}`;
  if (!category || !location) return page.slug;
  const noun = /(s|cafes)$/i.test(category) ? category : `${category} restaurants`;
  return `${noun} in ${location}`;
}

/** A pseo_pages row as the /restaurants hub reads it (SEO-038). */
export interface HubPseoPageRow extends PseoPageState {
  page_type_id?: string | null;
  dimensions?: Array<{ dimension: string; name: string; slug?: string | null }> | null;
}

/** One indexable cuisine x area page, ready to link from the hub. */
export interface HubAreaPage {
  href: string;
  label: string;
  categorySlug: string;
  locationSlug: string;
}

/**
 * The cuisine x area pages the /restaurants hub may link to (SEO-038):
 * published, no noindex, and inside the SEO-041 coverage scope (a restaurant
 * category over a suburb or mapped neighbourhood). The hub reads pseo_pages
 * when it renders, so the prerender links whatever the coverage rule has
 * published on the day it runs, and never a page it has noindexed or pulled.
 */
export function hubAreaPages(rows: readonly HubPseoPageRow[]): HubAreaPage[] {
  const out: HubAreaPage[] = [];
  for (const row of rows) {
    if (!isIndexablePseoPage(row)) continue;
    const dims = (row.dimensions ?? []).flatMap((d) =>
      d && d.slug ? [{ dimension: d.dimension, slug: d.slug, name: d.name }] : [],
    );
    if (!isCoverageScoped(row.page_type_id ?? '', dims)) continue;
    // An area page (content-location, SEO-065) has no category dimension.
    const categorySlug = dims.find((d) => d.dimension === 'category')?.slug ?? AREA_PAGE_CATEGORY;
    const location = dims.find((d) => d.dimension === 'location');
    if (!location) continue;
    out.push({ href: row.slug, label: areaPageLabel(row), categorySlug, locationSlug: location.slug });
  }
  // Each area's all-restaurants page leads its cuisine pages.
  const isArea = (p: HubAreaPage) => (p.categorySlug === AREA_PAGE_CATEGORY ? 0 : 1);
  return out.sort((a, b) => isArea(a) - isArea(b) || a.href.localeCompare(b.href));
}
