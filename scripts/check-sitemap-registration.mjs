#!/usr/bin/env node
/**
 * A generated sitemap must be registered in all three places (WEB-SEO-035),
 * and there must be exactly one sitemap index (WEB-SEO-038 AC4).
 *
 * THE DEFECT THIS EXISTS FOR. sitemap-hotels.xml has been generated since
 * WEB-SEO-034 and listed in robots.txt, in the index the generator writes and
 * in the prerenderer's priority list - but NOT in public/sitemap-index.xml,
 * the hand-maintained copy. Nothing failed. A sitemap that is written and not
 * submitted is indistinguishable, from outside, from one that was never
 * written, and there were four separate lists to keep in step by hand.
 *
 * The three:
 *   1. scripts/generate-dynamic-sitemaps.ts   writeSitemap('sitemap-X.xml')
 *   2. CHILD_SITEMAPS, the index that same file writes to public/sitemap.xml
 *   3. public/robots.txt                      Sitemap: .../sitemap-X.xml
 *   4. scripts/prerender.mjs                  ENTITY_SITEMAPS
 *
 * IT WAS FOUR. public/sitemap-index.xml, a hand copy of the generated index,
 * is deleted (WEB-SEO-038) and 301s to /sitemap.xml. The rule that replaced it
 * is stricter: no second sitemap index may appear in public/ at all, because
 * the failure here was never one stale file - it was that a copy of a
 * generated artifact existed for anyone to keep in step by hand, and it
 * drifted within weeks.
 *
 * sitemap-static.xml is exempt from rule 1: it is committed, not generated.
 * Its route parity is scripts/check-seo-route-parity.mjs's job.
 *
 * Usage: node scripts/check-sitemap-registration.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';

const GENERATOR = 'scripts/generate-dynamic-sitemaps.ts';
const PRERENDER = 'scripts/prerender.mjs';
const ROBOTS = 'public/robots.txt';

/** Committed rather than generated, so it has no writeSitemap call. */
const NOT_GENERATED = new Set(['sitemap-static.xml']);

const generator = readFileSync(GENERATOR, 'utf8');
const prerender = readFileSync(PRERENDER, 'utf8');
const robots = readFileSync(ROBOTS, 'utf8');

const namesFrom = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]));

const generated = namesFrom(generator, /writeSitemap\(\s*'(sitemap-[a-z0-9-]+\.xml)'/g);
// The index is built from CHILD_SITEMAPS in the generator, so its entries are
// matched out of that array rather than out of a template literal - which is
// what this read used to do, and it stopped matching the moment the template
// became a .map() (WEB-SEO-038 AC3).
const childBlock = generator.match(/const CHILD_SITEMAPS = \[([\s\S]*?)\];/);
if (!childBlock) {
  console.error(`[sitemap-registration] could not find CHILD_SITEMAPS in ${GENERATOR}`);
  process.exit(1);
}
const writtenIndex = namesFrom(childBlock[1], /'(sitemap-[a-z0-9-]+\.xml)'/g);
const inRobots = namesFrom(robots, /^Sitemap:\s*\S*?\/(sitemap-[a-z0-9-]+\.xml)\s*$/gm);

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
  if (!inPrerender.has(name)) problems.push(`${name} is generated but absent from ENTITY_SITEMAPS in ${PRERENDER}, so its URLs are submitted and never prerendered.`);
}

// The other direction: a list naming a sitemap nothing writes points crawlers
// at a 404, which is worse than omitting it.
for (const [label, set] of [
  [`the index ${GENERATOR} writes`, writtenIndex],
  [ROBOTS, inRobots],
  [`ENTITY_SITEMAPS in ${PRERENDER}`, inPrerender],
]) {
  for (const name of set) {
    if (NOT_GENERATED.has(name) || generated.has(name)) continue;
    problems.push(`${label} names ${name}, which no generator writes.`);
  }
}

/**
 * WEB-SEO-038 AC4, second half: who may BUILD a sitemap index.
 *
 * The file rule below catches a committed copy. It does not catch code that
 * assembles one, and two edge functions do:
 *
 *   generate-sitemaps      invoked from the admin SEO tools (SEOTools.tsx:476)
 *   regenerate-sitemaps    driven by the sitemap_change_queue pg_cron job
 *
 * Both are pre-existing and neither is this story's to delete - an endpoint an
 * admin screen calls is a backward-compatibility event under CLAUDE.md. They
 * are named here so a THIRD one fails the build, and so the defect is written
 * down rather than rediscovered: generate-sitemaps builds an index with three
 * children out of fourteen, and lists ${baseUrl}/sitemap.xml among them - which
 * is the index itself, nested inside its own <sitemapindex>. It returns the
 * string in a JSON response rather than writing it, so nothing ships today;
 * anything that starts publishing that response would submit a self-referential
 * index naming a fifth of the sitemaps.
 */
const SELF = 'scripts/check-sitemap-registration.mjs';

const INDEX_BUILDERS_ALLOWED = new Set([
  'scripts/generate-dynamic-sitemaps.ts',
  'supabase/functions/generate-sitemaps/index.ts',
  'supabase/functions/regenerate-sitemaps/index.ts',
]);

function findIndexBuilders(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) findIndexBuilders(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      // THIS FILE IS EXCLUDED AND THAT IS NOT LAZINESS. The first version of
      // this rule reported check-sitemap-registration.mjs itself, because the
      // tag it searches for appears in its own source - once in the comment
      // above and once inside the regex doing the searching. Stripping
      // comments is not enough: the regex literal is code. The ninth time in
      // this repo that a check has fired on the text explaining it.
      if (full === SELF) continue;
      const code = readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(?<!:)\/\/.*$/gm, '');
      if (/<sitemapindex[\s>]/.test(code)) out.push(full);
    }
  }
  return out;
}

const builders = [...findIndexBuilders('scripts'), ...findIndexBuilders('src'), ...findIndexBuilders('supabase')];
for (const file of builders) {
  if (!INDEX_BUILDERS_ALLOWED.has(file)) {
    problems.push(
      `${file} assembles a <sitemapindex>. There is one sitemap index and scripts/generate-dynamic-sitemaps.ts writes it.`,
    );
  }
}

// WEB-SEO-038 AC4. Exactly one sitemap index FILE. A second one is a copy of a
// generated file, and the only thing a copy of a generated file does is drift.
const INDEX_FILES = readdirSync('public').filter((f) => {
  if (!/^sitemap.*\.xml$/.test(f)) return false;
  return /<sitemapindex[\s>]/.test(readFileSync(`public/${f}`, 'utf8'));
});
if (INDEX_FILES.length !== 1 || INDEX_FILES[0] !== 'sitemap.xml') {
  problems.push(
    `public/ holds ${INDEX_FILES.length} sitemap index file(s) (${INDEX_FILES.join(', ') || 'none'}); ` +
      'there must be exactly one, public/sitemap.xml, which the generator writes.',
  );
}

if (problems.length > 0) {
  console.error('\nX A sitemap is registered in some places and not others:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nAll three lists have to agree, or a sitemap is generated and never submitted,\n' +
      'or submitted and never generated - and there must be exactly one sitemap\n' +
      'index, because a second one is a hand copy of a generated file. See the header.\n',
  );
  process.exit(1);
}

console.log(
  `[sitemap-registration] ${generated.size} generated sitemap(s) are registered in the index, robots.txt and ENTITY_SITEMAPS, and public/ holds exactly one sitemap index.`,
);
