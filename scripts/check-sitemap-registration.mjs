#!/usr/bin/env node
/**
 * A generated sitemap must be registered in all four places (WEB-SEO-035).
 *
 * THE DEFECT THIS EXISTS FOR. sitemap-hotels.xml has been generated since
 * WEB-SEO-034 and listed in robots.txt, in the index the generator writes and
 * in the prerenderer's priority list - but NOT in public/sitemap-index.xml,
 * the hand-maintained copy. Nothing failed. A sitemap that is written and not
 * submitted is indistinguishable, from outside, from one that was never
 * written, and there were four separate lists to keep in step by hand.
 *
 * The four:
 *   1. scripts/generate-dynamic-sitemaps.ts   writeSitemap('sitemap-X.xml')
 *   2. the sitemap index that same file writes to public/sitemap.xml
 *   3. public/robots.txt                      Sitemap: .../sitemap-X.xml
 *   4. scripts/prerender.mjs                  ENTITY_SITEMAPS
 *
 * public/sitemap-index.xml is checked too, because it exists and is served.
 *
 * sitemap-static.xml is exempt from rule 1: it is committed, not generated.
 * Its route parity is scripts/check-seo-route-parity.mjs's job.
 *
 * Usage: node scripts/check-sitemap-registration.mjs
 */
import { readFileSync } from 'node:fs';

const GENERATOR = 'scripts/generate-dynamic-sitemaps.ts';
const PRERENDER = 'scripts/prerender.mjs';
const ROBOTS = 'public/robots.txt';
const COMMITTED_INDEX = 'public/sitemap-index.xml';

/** Committed rather than generated, so it has no writeSitemap call. */
const NOT_GENERATED = new Set(['sitemap-static.xml']);

const generator = readFileSync(GENERATOR, 'utf8');
const prerender = readFileSync(PRERENDER, 'utf8');
const robots = readFileSync(ROBOTS, 'utf8');
const committedIndex = readFileSync(COMMITTED_INDEX, 'utf8');

const namesFrom = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]));

const generated = namesFrom(generator, /writeSitemap\(\s*'(sitemap-[a-z0-9-]+\.xml)'/g);
// The index template is a template literal inside the generator, so its entries
// are matched out of the same source.
const writtenIndex = namesFrom(generator, /\$\{baseUrl\}\/(sitemap-[a-z0-9-]+\.xml)</g);
const inRobots = namesFrom(robots, /^Sitemap:\s*\S*?\/(sitemap-[a-z0-9-]+\.xml)\s*$/gm);
const inCommitted = namesFrom(committedIndex, /<loc>\S*?\/(sitemap-[a-z0-9-]+\.xml)<\/loc>/g);

const entityBlock = prerender.match(/const ENTITY_SITEMAPS = \[([\s\S]*?)\];/);
if (!entityBlock) {
  console.error(`[sitemap-registration] could not find ENTITY_SITEMAPS in ${PRERENDER}`);
  process.exit(1);
}
const inPrerender = namesFrom(entityBlock[1], /'(sitemap-[a-z0-9-]+\.xml)'/g);

const problems = [];

for (const name of generated) {
  if (!writtenIndex.has(name)) problems.push(`${name} is generated but missing from the sitemap index ${GENERATOR} writes.`);
  if (!inRobots.has(name)) problems.push(`${name} is generated but not submitted in ${ROBOTS}.`);
  if (!inCommitted.has(name)) problems.push(`${name} is generated but missing from ${COMMITTED_INDEX}.`);
  if (!inPrerender.has(name)) problems.push(`${name} is generated but absent from ENTITY_SITEMAPS in ${PRERENDER}, so its URLs are submitted and never prerendered.`);
}

// The other direction: a list naming a sitemap nothing writes points crawlers
// at a 404, which is worse than omitting it.
for (const [label, set] of [
  [`the index ${GENERATOR} writes`, writtenIndex],
  [ROBOTS, inRobots],
  [COMMITTED_INDEX, inCommitted],
  [`ENTITY_SITEMAPS in ${PRERENDER}`, inPrerender],
]) {
  for (const name of set) {
    if (NOT_GENERATED.has(name) || generated.has(name)) continue;
    problems.push(`${label} names ${name}, which no generator writes.`);
  }
}

if (problems.length > 0) {
  console.error('\nX A sitemap is registered in some places and not others:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nAll four lists have to agree, or a sitemap is generated and never submitted,\n' +
      'or submitted and never generated. See the header of this script.\n',
  );
  process.exit(1);
}

console.log(
  `[sitemap-registration] ${generated.size} generated sitemap(s) are registered in the index, robots.txt, the committed index and ENTITY_SITEMAPS.`,
);
