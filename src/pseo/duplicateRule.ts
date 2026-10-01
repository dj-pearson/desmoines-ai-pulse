/**
 * SEO-064 - a pSEO page that adds a dimension to its parent must list
 * something its parent does not.
 *
 * SEO-056 found 80 pages whose extra dimension changes nothing:
 *
 *   /things-to-do/<audience>/<time>   (40)  fetchListings never reads the
 *        audience dimension; the calendar records no audience. Every one lists
 *        exactly the events its non-audience parent /things-to-do/<time> lists.
 *   /<cuisine>/<time>                 (40)  restaurants carry no date, so the
 *        time window is never applied. /mexican/august and /mexican/winter list
 *        the same twelve restaurants as the cuisine with no window at all.
 *
 * Several URLs rendering one list to catch different queries is the doorway
 * pattern. The rule, measured on the page's live listing against its parent's
 * (the same query in listingFilters.ts / PseoLiveListings.tsx with the child's
 * extra dimension removed):
 *
 *   indexable   the page lists at least MIN_DISTINCT_ITEMS items AND under
 *               MAX_PARENT_OVERLAP of them are also in the parent's listing
 *   otherwise   with Search Console impressions: robots "noindex, follow" and
 *               seo.canonicalUrl = the parent page (it stays reachable, the
 *               query it ranked for consolidates on the parent)
 *               with none: unpublished and 301'd to the parent page in
 *               public/_redirects, out of sitemap-pseo.xml
 *
 * Overlap is |child AND parent| / |child|: the share of what the page shows
 * that the parent already shows.
 *
 * A dimension the listing query never reads (ignoredDimension) is 100% overlap
 * by construction, on every day, whatever the data. scripts/check-pseo-coverage.ts
 * holds those out of the sitemap offline, and measures the rest online.
 *
 * Plain TypeScript with no React or Supabase imports, so a tsx script can
 * import it.
 */
import { CATEGORY_FILTERS } from './listingFilters';

/** Above or at this share of the child's items also in the parent, the page is a duplicate. */
export const MAX_PARENT_OVERLAP = 0.7;
/** A page needs at least this many items of its own to be indexable at all. */
export const MIN_DISTINCT_ITEMS = 5;

/**
 * Where a restaurant x time page's parent listing lives. The cuisine-only
 * listing has no page of its own: /restaurants/<cuisine> is shadowed by the
 * restaurant detail route, /<cuisine> has no row, and /things-to-do/<cuisine>
 * resolves to events and lists nothing. The restaurant directory is the page
 * that holds every cuisine's list, so it takes the canonical and the 301s
 * until a cuisine hub exists.
 */
export const RESTAURANT_TIME_PARENT_PAGE = '/restaurants';

export type DuplicateFamily = 'audience-time' | 'restaurant-time';

interface Dim {
  dimension: string;
  slug: string;
  name?: string;
}

const TIME_DIMENSIONS = new Set(['temporal', 'occasion']);
const RESTAURANT_CATEGORIES = new Set(
  Object.entries(CATEGORY_FILTERS)
    .filter(([, f]) => f.entity === 'restaurants')
    .map(([slug]) => slug),
);

/**
 * Which SEO-064 family a page belongs to, or null. Decided from the page type
 * and its dimensions, never the slug, so a renamed row is still governed.
 */
export function duplicateFamily(pageTypeId: string, dimensions: readonly Dim[]): DuplicateFamily | null {
  const time = dimensions.find((d) => TIME_DIMENSIONS.has(d.dimension));
  if (!time) return null;
  const has = (k: string) => dimensions.some((d) => d.dimension === k);
  if (pageTypeId === 'audience-temporal' && has('audience') && !has('category') && !has('location')) {
    return 'audience-time';
  }
  const category = dimensions.find((d) => d.dimension === 'category');
  if (pageTypeId === 'category-temporal' && category && RESTAURANT_CATEGORIES.has(category.slug) && !has('location')) {
    return 'restaurant-time';
  }
  return null;
}

/**
 * The dimension that separates the page from its parent, when the live listing
 * query never reads it. Returning non-null means the page cannot pass the rule.
 * Kept beside the query it describes: if PseoLiveListings.fetchListings starts
 * filtering on audience, or restaurants gain dates, this must change with it
 * (duplicateRule.test.ts pins both against the component source).
 */
export function ignoredDimension(family: DuplicateFamily): 'audience' | 'temporal' {
  return family === 'audience-time' ? 'audience' : 'temporal';
}

export interface ParentRef {
  /** The parent's dimensions: the listing the child is compared with. */
  dimensions: Dim[];
  /** The parent's own pSEO slug, before redirects. null when it has no page. */
  slug: string | null;
}

/** The child's dimensions with its distinguishing one removed. */
export function parentOf(family: DuplicateFamily, dimensions: readonly Dim[]): ParentRef {
  const time = dimensions.find((d) => TIME_DIMENSIONS.has(d.dimension)) as Dim;
  if (family === 'audience-time') {
    return {
      dimensions: [{ dimension: 'content_type', slug: 'things-to-do', name: 'Things to Do' }, { ...time }],
      slug: `/things-to-do/${time.slug}`,
    };
  }
  const category = dimensions.find((d) => d.dimension === 'category') as Dim;
  return { dimensions: [{ ...category }], slug: null };
}

/** Where a family falls back to when its parent page is in no sitemap. */
export const FAMILY_HUB: Readonly<Record<DuplicateFamily, string>> = {
  'audience-time': '/things-to-do',
  'restaurant-time': RESTAURANT_TIME_PARENT_PAGE,
};

/**
 * The URL a duplicate canonicals or 301s to: the parent's own page followed
 * through public/_redirects (/things-to-do/today is itself a 301 to
 * /events/today since SEO-056), or the restaurant directory. When `submitted`
 * (the sitemapped paths) is given and the parent is not in it, the family's
 * hub instead: a 301 to a page no sitemap lists is what
 * check-sitemap-redirects.mjs exists to stop (/things-to-do/spring today).
 */
export function parentPage(
  family: DuplicateFamily,
  dimensions: readonly Dim[],
  redirects: ReadonlyMap<string, string>,
  submitted?: ReadonlySet<string>,
): string {
  const ref = parentOf(family, dimensions);
  let target = ref.slug ?? RESTAURANT_TIME_PARENT_PAGE;
  for (let hops = 0; hops < 5 && redirects.has(target); hops++) target = redirects.get(target) as string;
  if (submitted && !submitted.has(target)) return FAMILY_HUB[family];
  return target;
}

/** Share of the child's items the parent also lists; 1 for an empty child. */
export function parentOverlap(childIds: readonly string[], parentIds: readonly string[]): number {
  if (childIds.length === 0) return 1;
  const parent = new Set(parentIds);
  return childIds.filter((id) => parent.has(id)).length / childIds.length;
}

export type DuplicateVerdict = 'indexable' | 'noindex-canonical' | 'redirect';

/** True when the page's own list clears both thresholds. */
export function listsSomethingNew(childCount: number, overlap: number): boolean {
  return childCount >= MIN_DISTINCT_ITEMS && overlap < MAX_PARENT_OVERLAP;
}

export function duplicateVerdict(childCount: number, overlap: number, impressions: number): DuplicateVerdict {
  if (listsSomethingNew(childCount, overlap)) return 'indexable';
  return impressions > 0 ? 'noindex-canonical' : 'redirect';
}
