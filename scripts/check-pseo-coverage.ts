#!/usr/bin/env tsx
/**
 * SEO-041 gate: cuisine x suburb pSEO pages obey the coverage rule.
 *
 *   under 3 places   not published
 *   3-4 places       published only with robots "noindex, follow"
 *   5+ places        indexable, unless its listing is identical to another
 *                    indexable page's (then noindex)
 *
 * The rule itself is src/pseo/coverageRule.ts. This script has two halves:
 *
 * OFFLINE (always runs). supabase/functions/_shared/pseoCoverage.ts repeats
 * the thresholds, locations and category patterns for the generate-pseo-page
 * edge function, which cannot import from src/. A threshold changed in one
 * copy and not the other would let the generator publish what this check
 * then fails, so the two are compared here.
 *
 * ONLINE (needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, read from .env
 * or the environment). Counts places per combination exactly as the live
 * listing does and fails on any published page whose stored state disagrees,
 * or whose data-built copy names a listing that has since changed. Without
 * credentials it says so and the online half is skipped, loudly.
 *
 * SEO-064 DUPLICATE RULE (src/pseo/duplicateRule.ts), for audience x time
 * and restaurant cuisine x time pages, which add a dimension the listing
 * never reads:
 *   offline  no such page, for any taxonomy combination, is in
 *            sitemap-pseo.xml, and any 301 for one points at its parent page;
 *   online   each published one is measured against its parent's listing;
 *            unless it lists 5+ items with under 70% shared, it must carry
 *            robots noindex and canonical the parent page.
 *
 * Usage: npx tsx scripts/check-pseo-coverage.ts [--table]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  COVERAGE_CATEGORIES,
  COVERAGE_LOCATIONS,
  MIN_PLACES_TO_INDEX,
  MIN_PLACES_TO_PUBLISH,
} from '../src/pseo/coverageRule';
import { CATEGORY_FILTERS } from '../src/pseo/listingFilters';
import { NEIGHBORHOOD_SLUGS } from '../src/lib/neighborhoodBoundaries';
import { computePseoCoverage } from './lib/pseoCoverage';
import { audienceDimension, temporalDimension } from '../src/pseo/taxonomy';
import { duplicateFamily, parentPage } from '../src/pseo/duplicateRule';
import {
  duplicateStateProblems,
  measureDuplicates,
  readRedirects,
  readSitemapPaths,
  type DuplicatePageRow,
} from './lib/pseoDuplicates';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems: string[] = [];

// --- offline: the edge function's copy ---------------------------------------
const edgePath = path.join(ROOT, 'supabase', 'functions', '_shared', 'pseoCoverage.ts');
const edge = readFileSync(edgePath, 'utf8');
const num = (name: string) => Number(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(edge)?.[1]);
if (num('MIN_PLACES_TO_PUBLISH') !== MIN_PLACES_TO_PUBLISH) {
  problems.push(`MIN_PLACES_TO_PUBLISH is ${num('MIN_PLACES_TO_PUBLISH')} in ${edgePath}, ${MIN_PLACES_TO_PUBLISH} in coverageRule.ts`);
}
if (num('MIN_PLACES_TO_INDEX') !== MIN_PLACES_TO_INDEX) {
  problems.push(`MIN_PLACES_TO_INDEX is ${num('MIN_PLACES_TO_INDEX')} in ${edgePath}, ${MIN_PLACES_TO_INDEX} in coverageRule.ts`);
}
const edgeLocBlock = /COVERAGE_LOCATIONS[^=]*=\s*\[([\s\S]*?)\]/.exec(edge)?.[1] ?? '';
const edgeLocations = [...edgeLocBlock.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
if (edgeLocations.join(',') !== [...COVERAGE_LOCATIONS].sort().join(',')) {
  problems.push(`COVERAGE_LOCATIONS differ: edge [${edgeLocations.join(', ')}] vs src [${[...COVERAGE_LOCATIONS].sort().join(', ')}]`);
}
// SEO-060: which of those are neighbourhoods matched on restaurants.neighborhood.
const edgeNbBlock = /NEIGHBORHOOD_LOCATIONS[^=]*=\s*\[([\s\S]*?)\]/.exec(edge)?.[1] ?? '';
const edgeNeighborhoods = [...edgeNbBlock.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
if (edgeNeighborhoods.join(',') !== [...NEIGHBORHOOD_SLUGS].sort().join(',')) {
  problems.push(
    `NEIGHBORHOOD_LOCATIONS differ: edge [${edgeNeighborhoods.join(', ')}] vs src/lib/neighborhoodBoundaries.ts [${[...NEIGHBORHOOD_SLUGS].sort().join(', ')}]`,
  );
}
const edgePatBlock = /CUISINE_PATTERNS[^=]*=\s*\{([\s\S]*?)\};/.exec(edge)?.[1] ?? '';
const edgePatterns = new Map([...edgePatBlock.matchAll(/'?([a-z0-9-]+)'?:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
for (const slug of COVERAGE_CATEGORIES) {
  const want = CATEGORY_FILTERS[slug].pattern;
  if (edgePatterns.get(slug) !== want) {
    problems.push(`cuisine pattern for ${slug}: edge '${edgePatterns.get(slug) ?? '(missing)'}' vs listingFilters '${want}'`);
  }
}
for (const slug of edgePatterns.keys()) {
  if (!COVERAGE_CATEGORIES.includes(slug)) problems.push(`edge CUISINE_PATTERNS has ${slug}, which listingFilters.ts does not list as a restaurant category`);
}
const edgeStatusBlock = /NOT_VISITABLE_STATUSES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(edge)?.[1] ?? '';
const hoursSrc = readFileSync(path.join(ROOT, 'src', 'lib', 'restaurantHours.ts'), 'utf8');
const srcStatusBlock = /NOT_VISITABLE_STATUSES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(hoursSrc)?.[1] ?? '';
const statuses = (b: string) => [...b.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort().join(',');
if (!srcStatusBlock || statuses(edgeStatusBlock) !== statuses(srcStatusBlock)) {
  problems.push(`NOT_VISITABLE_STATUSES differ: edge [${statuses(edgeStatusBlock)}] vs src/lib/restaurantHours.ts [${statuses(srcStatusBlock)}]`);
}

// --- offline: SEO-064 duplicates are out of the sitemap, 301s hit the parent -
const redirects = readRedirects(ROOT);
const pseoSitemap = readSitemapPaths(ROOT, 'sitemap-pseo.xml');
const allSitemapped = readSitemapPaths(ROOT);
{
  const combos: Array<{ slug: string; pageType: string; dims: DuplicatePageRow['dimensions'] }> = [];
  for (const t of temporalDimension.values) {
    const td = { dimension: 'temporal', slug: t.slug, name: t.name };
    for (const a of audienceDimension.values) {
      combos.push({
        slug: `/things-to-do/${a.slug}/${t.slug}`,
        pageType: 'audience-temporal',
        dims: [{ dimension: 'audience', slug: a.slug, name: a.name }, td],
      });
    }
    for (const c of COVERAGE_CATEGORIES) {
      combos.push({ slug: `/${c}/${t.slug}`, pageType: 'category-temporal', dims: [{ dimension: 'category', slug: c, name: c }, td] });
    }
  }
  let governed = 0;
  for (const c of combos) {
    const family = duplicateFamily(c.pageType, c.dims);
    if (!family) {
      problems.push(`duplicate rule: ${c.slug} should be governed and duplicateFamily() says it is not`);
      continue;
    }
    governed++;
    // The extra dimension is one the listing never reads, so the page is its
    // parent's list under another URL on every day: never submitted.
    if (pseoSitemap.has(c.slug)) problems.push(`${c.slug}: duplicates its parent's listing (SEO-064) and is in sitemap-pseo.xml`);
    const to = redirects.get(c.slug);
    const want = parentPage(family, c.dims, redirects, allSitemapped);
    if (to !== undefined && to !== want) problems.push(`${c.slug}: 301s to ${to}; the duplicate rule's parent page is ${want}`);
  }
  if (governed === 0) problems.push('duplicate rule: no taxonomy combination was governed; the offline check saw nothing');
}

// --- online -----------------------------------------------------------------
function env(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env };
  try {
    for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // no .env: environment only
  }
  return out;
}

const E = env();
const base = E.VITE_SUPABASE_URL;
const key = E.VITE_SUPABASE_ANON_KEY;

if (!base || !key) {
  if (problems.length) {
    console.error(`[pseo-coverage] ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.warn(
    '[pseo-coverage] offline half OK. ONLINE HALF SKIPPED: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set, ' +
      'so no published page was measured.',
  );
  process.exit(0);
}

const report = await computePseoCoverage({ base, key });
problems.push(...report.violations);

// --- online: SEO-064 duplicates ----------------------------------------------
const dupRes = await fetch(
  `${base.replace(/\/+$/, '')}/rest/v1/pseo_pages?select=slug,page_type_id,dimensions,seo,is_published&is_published=eq.true&order=slug&limit=1000`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!dupRes.ok) throw new Error(`pseo_pages: HTTP ${dupRes.status}`);
const dupPages = (await dupRes.json()) as DuplicatePageRow[];
const dupBySlug = new Map(dupPages.map((p) => [p.slug, p]));
const duplicates = await measureDuplicates({ base, key }, dupPages, redirects, allSitemapped);
for (const m of duplicates) {
  problems.push(...duplicateStateProblems(m, dupBySlug.get(m.slug) as DuplicatePageRow, redirects, pseoSitemap));
}

if (process.argv.includes('--table')) {
  console.log('slug | places | verdict | published | noindex | names');
  for (const r of report.rows.filter((x) => x.places > 0 || x.published)) {
    console.log(
      `${r.slug} | ${r.places} | ${r.verdict} | ${r.published === null ? '-' : r.published} | ${r.noindexed} | ${r.names.join('; ')}`,
    );
  }
}

const missing = report.rows.filter((r) => r.verdict === 'indexable' && !r.published).map((r) => `${r.slug} (${r.places})`);

if (problems.length) {
  console.error(`[pseo-coverage] ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const counts = { indexable: 0, noindex: 0, 'not-generated': 0 };
for (const r of report.rows) counts[r.verdict]++;
console.log(
  `[pseo-coverage] OK ${report.rows.length} area x (cuisine or all-restaurants) combinations: ${counts.indexable} indexable, ` +
    `${counts.noindex} noindex, ${counts['not-generated']} under the floor. Published: ${report.indexable.length} indexable, ` +
    `${report.noindexPublished.length} noindex. Duplicate rule (SEO-064): ${duplicates.length} published page(s) measured, ` +
    `${duplicates.filter((d) => d.passes).length} list enough of their own to be indexable.` +
    (missing.length ? ` Indexable but not published yet: ${missing.join(', ')}.` : ''),
);
