#!/usr/bin/env node
/**
 * SEO-025: the pSEO location ranking must stay in step with the taxonomy and
 * with what is actually published.
 *
 * Generation is capped at 30 pages/hour and 200/day and every page is a Claude
 * call, so the ORDER locations are generated in decides what a capped run buys.
 * src/pseo/measuredDemand.ts holds that order, measured from the Keyword
 * Planner join. Three ways it can silently stop being true:
 *
 *   1. A location is added to taxonomy.ts and never ranked, so it sorts as
 *      undefined and lands wherever the comparator happens to put it.
 *   2. A location is removed from taxonomy.ts while the ranking still names it.
 *   3. A deprioritised location gets published anyway, which is the specific
 *      waste this story exists to stop.
 *
 * Parses both files as text rather than importing them - these are .ts modules
 * and this gate runs in plain node from CI without a build step.
 *
 * Run: node scripts/check-pseo-demand.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- taxonomy locations -----------------------------------------------------
// taxonomy.ts is a flat list of dimension entries rather than grouped blocks,
// so a location is any entry whose own `dimension` field says so. Matching
// slugs globally would sweep in cuisines, audiences and months too.
const taxonomy = readFileSync(join(ROOT, 'src', 'pseo', 'taxonomy.ts'), 'utf8');
const taxonomyLocations = new Set(
  [...taxonomy.matchAll(
    /slug:\s*'([a-z0-9-]+)',[\s\S]{0,200}?dimension:\s*'location'/g
  )].map((m) => m[1])
);
if (taxonomyLocations.size === 0) {
  console.error('[pseo-demand] found no location entries in taxonomy.ts - has its shape changed?');
  process.exit(1);
}

// --- ranked locations -------------------------------------------------------
const demandSrc = readFileSync(join(ROOT, 'src', 'pseo', 'measuredDemand.ts'), 'utf8');
const demandBlock = demandSrc.match(/LOCATION_DEMAND[^=]*=\s*\{([\s\S]*?)\n\};/);
const excludedBlock = demandSrc.match(/EXCLUDED_LOCATIONS[^=]*=\s*\[([\s\S]*?)\];/);
if (!demandBlock || !excludedBlock) {
  console.error('[pseo-demand] could not parse measuredDemand.ts');
  process.exit(1);
}
const ranked = new Map(
  [...demandBlock[1].matchAll(/'?([a-z0-9-]+)'?:\s*\{\s*monthlyVolume:\s*(\d+)/g)]
    .map((m) => [m[1], Number(m[2])])
);
const excluded = new Set([...excludedBlock[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));

// --- published pages --------------------------------------------------------
const sitemapPath = join(ROOT, 'public', 'sitemap-pseo.xml');
const published = existsSync(sitemapPath)
  ? [...readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)]
      .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''))
  : [];

// --- assertions -------------------------------------------------------------
const problems = [];

for (const slug of taxonomyLocations) {
  if (!ranked.has(slug)) {
    problems.push(`${slug}: in taxonomy.ts and absent from LOCATION_DEMAND, so it has no generation rank`);
  }
}
for (const slug of ranked.keys()) {
  if (!taxonomyLocations.has(slug)) {
    problems.push(`${slug}: ranked in LOCATION_DEMAND and absent from taxonomy.ts`);
  }
}
for (const slug of excluded) {
  if (!ranked.has(slug)) {
    problems.push(`${slug}: excluded but not ranked - keep its measured zero so the reason stays visible`);
  } else if (ranked.get(slug) !== 0) {
    problems.push(`${slug}: excluded while measuring ${ranked.get(slug)} monthly - exclude only measured zeros`);
  }
  const live = published.filter((p) => p.split('/').includes(slug));
  for (const p of live) {
    problems.push(`${slug}: deprioritised yet published at ${p}`);
  }
}

if (problems.length) {
  console.error(`[pseo-demand] ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nSee src/pseo/measuredDemand.ts for where the numbers come from.');
  process.exit(1);
}

const order = [...ranked.entries()]
  .filter(([s]) => !excluded.has(s))
  .sort((a, b) => b[1] - a[1]);
console.log(
  `[pseo-demand] OK ${taxonomyLocations.size} taxonomy locations, all ranked; ` +
  `${excluded.size} deprioritised on a measured zero and none published; ` +
  `next up ${order.slice(0, 3).map(([s, v]) => `${s} (${v.toLocaleString()})`).join(', ')}.`
);
