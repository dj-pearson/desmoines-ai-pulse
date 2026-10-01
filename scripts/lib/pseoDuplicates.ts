/**
 * SEO-064 - measures the pages src/pseo/duplicateRule.ts governs against their
 * parents, for the two consumers that must agree:
 *
 *   scripts/measure-pseo-duplicates.ts   the table (docs/seo/) and the SQL
 *   scripts/check-pseo-coverage.ts       fails when a published page breaks the rule
 *
 * Offline helpers read public/_redirects and public/sitemap-pseo.xml; the
 * online half reads production with the anon key.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  duplicateFamily,
  duplicateVerdict,
  listsSomethingNew,
  parentOf,
  parentOverlap,
  parentPage,
  type DuplicateFamily,
  type DuplicateVerdict,
} from '../../src/pseo/duplicateRule';
import { fetchListingIds } from './pseoListing';

export interface DuplicatePageRow {
  slug: string;
  page_type_id: string;
  dimensions: Array<{ dimension: string; slug: string; name: string }>;
  seo: { robots?: string; canonicalUrl?: string } | null;
  is_published: boolean;
}

/** 301 rules in public/_redirects, path -> target, trailing slashes dropped. */
export function readRedirects(root: string): Map<string, string> {
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  const out = new Map<string, string>();
  for (const line of readFileSync(path.join(root, 'public', '_redirects'), 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [from, to, code] = t.split(/\s+/);
    if (code === '301' && from && to) out.set(norm(from), norm(to));
  }
  return out;
}

/** Paths in one sitemap file under public/, or in all of them. */
export function readSitemapPaths(root: string, file?: string): Set<string> {
  const files = file ? [file] : readdirSync(path.join(root, 'public')).filter((f) => /^sitemap.*\.xml$/.test(f) && f !== 'sitemap-index.xml');
  const out = new Set<string>();
  for (const f of files) {
    const xml = readFileSync(path.join(root, 'public', f), 'utf8');
    for (const m of xml.matchAll(/<loc>\s*https?:\/\/[^/<\s]+(\/[^<\s]*)?\s*<\/loc>/g)) out.add((m[1] ?? '/').replace(/\/+$/, '') || '/');
  }
  return out;
}

export interface DuplicateMeasurement {
  slug: string;
  family: DuplicateFamily;
  /** The listing compared against: the parent's pSEO slug, or a description when it has none. */
  parentListing: string;
  /** Where the canonical or the 301 points. */
  target: string;
  childItems: number;
  parentItems: number;
  shared: number;
  overlap: number;
  passes: boolean;
}

export async function measureDuplicates(
  creds: { base: string; key: string },
  pages: readonly DuplicatePageRow[],
  redirects: ReadonlyMap<string, string>,
  submitted: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<DuplicateMeasurement[]> {
  const cache = new Map<string, Promise<string[]>>();
  const ids = (dims: DuplicatePageRow['dimensions']) => {
    const k = JSON.stringify(dims.map((d) => [d.dimension, d.slug]).sort());
    if (!cache.has(k)) cache.set(k, fetchListingIds(creds, dims, now));
    return cache.get(k) as Promise<string[]>;
  };
  const out: DuplicateMeasurement[] = [];
  for (const p of pages) {
    const family = duplicateFamily(p.page_type_id, p.dimensions);
    if (!family) continue;
    const parent = parentOf(family, p.dimensions);
    const [child, par] = await Promise.all([ids(p.dimensions), ids(parent.dimensions as DuplicatePageRow['dimensions'])]);
    const overlap = parentOverlap(child, par);
    const parentSet = new Set(par);
    out.push({
      slug: p.slug,
      family,
      parentListing: parent.slug ?? `${parent.dimensions[0].slug} restaurants, no time window`,
      target: parentPage(family, p.dimensions, redirects, submitted),
      childItems: child.length,
      parentItems: par.length,
      shared: child.filter((id) => parentSet.has(id)).length,
      overlap,
      passes: listsSomethingNew(child.length, overlap),
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Search Console impressions and clicks per path, trailing-slash variants summed. */
export function readGscPages(csvPath: string): Map<string, { clicks: number; impressions: number }> {
  const out = new Map<string, { clicks: number; impressions: number }>();
  const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1);
  for (const line of lines) {
    const m = /^"?(https?:\/\/[^,"]+)"?,(\d+),(\d+),/.exec(line);
    if (!m) continue;
    const p = (new URL(m[1]).pathname.replace(/\/+$/, '') || '/').toLowerCase();
    const cur = out.get(p) ?? { clicks: 0, impressions: 0 };
    cur.clicks += Number(m[2]);
    cur.impressions += Number(m[3]);
    out.set(p, cur);
  }
  return out;
}

export function verdictFor(m: DuplicateMeasurement, impressions: number): DuplicateVerdict {
  return duplicateVerdict(m.childItems, m.overlap, impressions);
}

/**
 * What the stored state must look like for a page that fails the rule, as
 * problems. A published page must carry noindex and canonical the parent page;
 * an unpublished one must 301 there and be out of the sitemap. A page that
 * passes may be in any state.
 */
export function duplicateStateProblems(
  m: DuplicateMeasurement,
  page: DuplicatePageRow,
  redirects: ReadonlyMap<string, string>,
  sitemap: ReadonlySet<string>,
): string[] {
  if (m.passes) return [];
  const why = `${m.childItems} item(s), ${Math.round(m.overlap * 100)}% shared with ${m.parentListing}`;
  const problems: string[] = [];
  if (page.is_published) {
    if (page.seo?.robots !== 'noindex, follow') problems.push(`${m.slug}: ${why}, and no robots noindex`);
    if ((page.seo?.canonicalUrl ?? page.slug) !== m.target) {
      problems.push(`${m.slug}: ${why}; canonical must be ${m.target}, is ${page.seo?.canonicalUrl ?? page.slug}`);
    }
  } else if (redirects.get(m.slug) !== m.target) {
    problems.push(`${m.slug}: unpublished duplicate (${why}) needs "${m.slug}  ${m.target}  301" in public/_redirects`);
  }
  if (sitemap.has(m.slug)) problems.push(`${m.slug}: ${why}, and still in public/sitemap-pseo.xml`);
  return problems;
}
