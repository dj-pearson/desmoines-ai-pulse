/**
 * SEO-041 - measures every cuisine x suburb combination against the coverage
 * rule in src/pseo/coverageRule.ts, for the two consumers that must agree:
 *
 *   scripts/check-pseo-coverage.ts       fails when a published page breaks the rule
 *   scripts/generate-dynamic-sitemaps.ts submits the indexable ones and leaves
 *                                        the noindex ones out
 *
 * SEO-065: each area's all-restaurants page (/restaurants/<area>) is measured
 * as one more combination, with AREA_PAGE_CATEGORY in the category slot.
 *
 * It covers every combination the rule governs, not only the published rows,
 * so the report shows what is missing as well as what is wrong.
 *
 * Reads production with the anon key (restaurants and pseo_pages are public
 * reads). Run with tsx: it imports TypeScript from src/.
 */
import { locationDimension, categoryDimension } from '../../src/pseo/taxonomy';
import {
  AREA_PAGE_CATEGORY,
  CITYWIDE,
  CITYWIDE_NAME,
  citywideSlug,
  COVERAGE_CATEGORIES,
  COVERAGE_PAGE_CATEGORIES,
  COVERAGE_LOCATIONS,
  finalVerdicts,
  isCoverageScoped,
  listingFingerprint,
  matchingPlaces,
  type CoverageRestaurantRow,
  type CoverageVerdict,
} from '../../src/pseo/coverageRule';

export interface PublishedPseoRow {
  id: string;
  slug: string;
  page_type_id: string;
  dimensions: Array<{ dimension: string; slug: string; name: string; tier?: number }>;
  seo: { robots?: string; title?: string; canonicalUrl?: string } | null;
  is_published: boolean;
  generation_meta: { generatedBy?: string; placeFingerprint?: string } | null;
  sections: Array<{ type: string; faqs?: Array<{ question: string; answer: string }> }> | null;
}

export interface CoverageRow {
  slug: string;
  category: string;
  location: string;
  locationName: string;
  places: number;
  names: string[];
  fingerprint: string;
  verdict: CoverageVerdict;
  /** null when no pseo_pages row exists for the slug at all. */
  published: boolean | null;
  noindexed: boolean;
  /**
   * For a page whose copy was written from the rows (DATA_TEMPLATE_GENERATOR),
   * the listing it was written against. null for LLM-written pages.
   */
  templateFingerprint: string | null;
}

/**
 * generation_meta.generatedBy on rows SEO-041 wrote from restaurant data with
 * templated copy instead of the LLM pipeline. Their FAQ names the places, so
 * they go stale when the listing changes, and the check says so.
 */
export const DATA_TEMPLATE_GENERATOR = 'seo-041-data-template';

/**
 * Written by generate-dynamic-sitemaps.ts, read by prerender.mjs (which spells
 * the same path out, being plain JS). Gitignored: it is per-build output.
 */
export const PSEO_NOINDEX_ROUTES_FILE = 'scripts/.generated/pseo-noindex-routes.json';

/**
 * SEO-064: published pSEO pages whose seo.canonicalUrl names another page
 * (route -> target), for scripts/check-prerender-head.mjs, which otherwise
 * requires every prerendered page to canonical itself. Written beside
 * PSEO_NOINDEX_ROUTES_FILE by generate-dynamic-sitemaps.ts; gitignored.
 */
export const PSEO_CANONICAL_ELSEWHERE_FILE = 'scripts/.generated/pseo-canonical-elsewhere.json';

export interface CoverageReport {
  rows: CoverageRow[];
  /** Published, in-scope pages whose stored state disagrees with the rule. */
  violations: string[];
  /** Published pSEO slugs that must not be in sitemap-pseo.xml (noindex, or under the floor). */
  keepOutOfSitemap: Set<string>;
  /** Published, in-scope, indexable slugs. */
  indexable: string[];
  /**
   * The indexable slugs whose copy was written from the rows
   * (DATA_TEMPLATE_GENERATOR). Only these are ADDED to the sitemap without
   * Search Console demand: an LLM-written page can clear the place count and
   * still name restaurants that are not in the table (/mexican/ankeny
   * recommends one), and the coverage rule is not a reason to start
   * submitting that.
   */
  submittable: string[];
  /**
   * Published slugs carrying noindex: prerendered, never submitted. In-scope
   * pages, plus (SEO-064) any other page that carries it, such as the
   * duplicates src/pseo/duplicateRule.ts holds at noindex.
   */
  noindexPublished: string[];
  /** SEO-064: published pages whose canonical names another page, route -> target. */
  canonicalElsewhere: Record<string, string>;
}

async function fetchAll<T>(base: string, key: string, table: string, select: string): Promise<T[]> {
  const root = base.replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${root}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${offset}`, {
      headers,
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page: unknown = await res.json();
    if (!Array.isArray(page)) throw new Error(`${table}: unexpected body ${JSON.stringify(page).slice(0, 200)}`);
    rows.push(...(page as T[]));
    if (page.length < 1000) break;
  }
  return rows;
}

/**
 * Pure core, separated from the network so the check can be exercised on
 * fixtures.
 */
export function evaluateCoverage(pages: readonly PublishedPseoRow[], restaurants: readonly CoverageRestaurantRow[]): CoverageReport {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const measured: Array<Omit<CoverageRow, 'verdict'>> = [];

  for (const locSlug of COVERAGE_LOCATIONS) {
    const loc = locationDimension.values.find((v) => v.slug === locSlug);
    if (!loc) throw new Error(`coverage location ${locSlug} is not in taxonomy.ts`);
    for (const catSlug of COVERAGE_PAGE_CATEGORIES) {
      // SEO-065: the area page's slot holds a content type, not a category.
      if (catSlug !== AREA_PAGE_CATEGORY && !categoryDimension.values.some((v) => v.slug === catSlug)) {
        throw new Error(`coverage category ${catSlug} is not in taxonomy.ts`);
      }
      const slug = `/${catSlug}/${locSlug}`;
      const page = bySlug.get(slug);
      // The listing component filters with the NAME stored on the row, so a row
      // carrying a different spelling from the taxonomy is measured as stored.
      const locationName = page?.dimensions.find((d) => d.dimension === 'location')?.name ?? loc.name;
      const places = matchingPlaces(restaurants, { slug: locSlug, name: locationName }, catSlug);
      measured.push({
        slug,
        category: catSlug,
        location: locSlug,
        locationName,
        places: places.length,
        names: places.map((p) => p.name).sort((a, b) => a.localeCompare(b)),
        fingerprint: listingFingerprint(places),
        published: page ? page.is_published : null,
        noindexed: page?.seo?.robots === 'noindex, follow',
        templateFingerprint:
          page?.generation_meta?.generatedBy === DATA_TEMPLATE_GENERATOR
            ? page.generation_meta.placeFingerprint ?? ''
            : null,
      });
    }
  }

  // The city-wide cuisine pages, /restaurants/<cuisine>: no area, so CITYWIDE
  // in the location slot. They were LLM-written and unreachable (a 404 from
  // the detail route) until RESTAURANT_CUISINE_SLUGS gave them the SEO-065
  // fallback; measuring them is what lets the writer rebuild them from rows.
  for (const catSlug of COVERAGE_CATEGORIES) {
    if (!categoryDimension.values.some((v) => v.slug === catSlug)) {
      throw new Error(`coverage category ${catSlug} is not in taxonomy.ts`);
    }
    const slug = citywideSlug(catSlug);
    const page = bySlug.get(slug);
    const places = matchingPlaces(restaurants, CITYWIDE, catSlug);
    measured.push({
      slug,
      category: catSlug,
      location: CITYWIDE,
      locationName: CITYWIDE_NAME,
      places: places.length,
      names: places.map((p) => p.name).sort((a, b) => a.localeCompare(b)),
      fingerprint: listingFingerprint(places),
      published: page ? page.is_published : null,
      noindexed: page?.seo?.robots === 'noindex, follow',
      templateFingerprint:
        page?.generation_meta?.generatedBy === DATA_TEMPLATE_GENERATOR
          ? page.generation_meta.placeFingerprint ?? ''
          : null,
    });
  }

  const verdicts = finalVerdicts(measured.map((m) => ({ slug: m.slug, places: m.places, fingerprint: m.fingerprint })));
  const rows: CoverageRow[] = measured.map((m) => ({ ...m, verdict: verdicts.get(m.slug) ?? 'not-generated' }));

  const violations: string[] = [];
  const keepOutOfSitemap = new Set<string>();
  const indexable: string[] = [];
  const submittable: string[] = [];
  const noindexPublished: string[] = [];

  for (const r of rows) {
    if (!r.published) continue;
    if (r.templateFingerprint !== null && r.templateFingerprint !== r.fingerprint) {
      violations.push(
        `${r.slug}: copy was written from a listing that has since changed (now ${r.places} place(s): ` +
          `${r.names.join(', ')}); rewrite it with scripts/write-pseo-coverage-pages.ts`,
      );
    }
    if (r.verdict === 'not-generated') {
      violations.push(`${r.slug}: published with ${r.places} place(s); under 3 it must be unpublished (and 301'd)`);
      keepOutOfSitemap.add(r.slug);
    } else if (r.verdict === 'noindex') {
      keepOutOfSitemap.add(r.slug);
      noindexPublished.push(r.slug);
      if (!r.noindexed) violations.push(`${r.slug}: ${r.places} place(s) and no robots noindex; 3-4 places, or a listing identical to another indexable page, must be noindex`);
    } else {
      if (r.noindexed) {
        violations.push(`${r.slug}: ${r.places} places and robots noindex; 5+ with a distinct listing is indexable`);
        keepOutOfSitemap.add(r.slug);
        noindexPublished.push(r.slug);
      } else {
        indexable.push(r.slug);
        if (r.templateFingerprint !== null) submittable.push(r.slug);
      }
    }
  }

  // A page outside the governed family that carries noindex for its own
  // reasons stays out of the sitemap too. Nothing writes that today; this
  // keeps a hand-set flag from being contradicted by the sitemap.
  // SEO-064 puts the duplicates src/pseo/duplicateRule.ts holds at noindex
  // here too, and they are prerendered like the in-scope noindex pages so a
  // JS-less crawler reads the noindex and the canonical, not the shell.
  const canonicalElsewhere: Record<string, string> = {};
  for (const p of pages) {
    if (!p.is_published) continue;
    const canonical = p.seo?.canonicalUrl;
    if (canonical && canonical.startsWith('/') && canonical !== p.slug) canonicalElsewhere[p.slug] = canonical;
    if (isCoverageScoped(p.page_type_id, p.dimensions)) continue;
    if (p.seo?.robots === 'noindex, follow') {
      keepOutOfSitemap.add(p.slug);
      noindexPublished.push(p.slug);
    }
  }

  return {
    rows,
    violations,
    keepOutOfSitemap,
    indexable: indexable.sort(),
    submittable: submittable.sort(),
    noindexPublished: noindexPublished.sort(),
    canonicalElsewhere,
  };
}

export async function computePseoCoverage({ base, key }: { base: string; key: string }): Promise<CoverageReport> {
  if (!base || !key) throw new Error('computePseoCoverage needs a Supabase URL and anon key.');
  const [pages, restaurants] = await Promise.all([
    fetchAll<PublishedPseoRow>(base, key, 'pseo_pages', 'id,slug,page_type_id,dimensions,seo,is_published,generation_meta,sections'),
    fetchAll<CoverageRestaurantRow>(base, key, 'restaurants', 'id,name,city,location,cuisine,status,is_merged,neighborhood'),
  ]);
  return evaluateCoverage(pages, restaurants);
}
