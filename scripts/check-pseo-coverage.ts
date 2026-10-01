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
import { computePseoCoverage } from './lib/pseoCoverage';

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
  `[pseo-coverage] OK ${report.rows.length} cuisine x suburb combinations: ${counts.indexable} indexable, ` +
    `${counts.noindex} noindex, ${counts['not-generated']} under the floor. Published: ${report.indexable.length} indexable, ` +
    `${report.noindexPublished.length} noindex.` +
    (missing.length ? ` Indexable but not published yet: ${missing.join(', ')}.` : ''),
);
