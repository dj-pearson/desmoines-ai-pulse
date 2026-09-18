#!/usr/bin/env node
/**
 * The neighborhood inventory must agree across every surface (WEB-SEO-036).
 *
 * WHAT THIS EXISTS FOR. Four files each carried their own list and no two of
 * them agreed:
 *
 *   prerender-routes.mjs + sitemap-static.xml   downtown, east-village, beaverdale, highland-park
 *   NeighborhoodsPage.tsx (the only links)      east-village, west-des-moines, ankeny, urbandale,
 *                                               johnston, clive, waukee, altoona
 *   NeighborhoodGuide.tsx (the editorial copy)  East Village, West Des Moines, Ankeny, Urbandale,
 *                                               Johnston, Clive, Waukee
 *   NeighborhoodPage.tsx (the actual content)   [] for every slug, always
 *
 * The overlap between what was SUBMITTED and what had CONTENT was one slug out
 * of four. downtown, beaverdale and highland-park were prerendered, sitemapped,
 * linked from nowhere, and had no editorial entry - so a crawler got an h1, a
 * generic promise sentence, and three tabs reading Events (0) / Dining (0) /
 * Attractions (0). Meanwhile the six with real hand-written copy were in
 * neither the prerender list nor the sitemap.
 *
 * The lists are one file now (src/lib/neighborhoods.ts) and the components read
 * it. The two that CANNOT import it - prerender-routes.mjs is plain ESM for
 * Node and sitemap-static.xml is a static artifact - are what this checks.
 *
 * Exit 0 when they agree, 1 otherwise.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRERENDER_ROUTES } from './prerender-routes.mjs';

const ROOT = process.cwd();
const INVENTORY = join(ROOT, 'src', 'lib', 'neighborhoods.ts');
const SITEMAP = join(ROOT, 'public', 'sitemap-static.xml');

/**
 * Read the slugs out of the TypeScript inventory without compiling it.
 *
 * A regex over source is normally the wrong tool, but importing a .ts module
 * from a plain-node script means pulling in tsx or a build step for what is a
 * list of string literals. The shape is pinned by the assertion below: if
 * neighborhoods.ts stops looking like this, the check fails loudly rather than
 * reading zero slugs and passing.
 */
function inventorySlugs() {
  const src = readFileSync(INVENTORY, 'utf8');
  const body = src.slice(src.indexOf('export const NEIGHBORHOODS'));
  const slugs = [...body.matchAll(/^\s{4}slug: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
  if (slugs.length === 0) {
    console.error(
      '[neighborhoods] read 0 slugs from src/lib/neighborhoods.ts. The file changed shape;\n' +
        'update the matcher in scripts/check-neighborhood-inventory.mjs rather than deleting this check.'
    );
    process.exit(1);
  }
  return slugs;
}

function sitemapSlugs() {
  const xml = readFileSync(SITEMAP, 'utf8');
  return [...xml.matchAll(/<loc>[^<]*\/neighborhoods\/([a-z0-9-]+)<\/loc>/g)].map((m) => m[1]);
}

function prerenderSlugs() {
  return PRERENDER_ROUTES.filter((r) => r.startsWith('/neighborhoods/')).map((r) =>
    r.slice('/neighborhoods/'.length)
  );
}

const want = inventorySlugs();
const surfaces = [
  ['prerender-routes.mjs', prerenderSlugs()],
  ['public/sitemap-static.xml', sitemapSlugs()],
];

let failed = false;
for (const [label, got] of surfaces) {
  const missing = want.filter((s) => !got.includes(s));
  const extra = got.filter((s) => !want.includes(s));
  if (missing.length === 0 && extra.length === 0) continue;
  failed = true;
  console.error(`\n[neighborhoods] ${label} disagrees with src/lib/neighborhoods.ts:`);
  if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
  if (extra.length) {
    console.error(`  not in the inventory: ${extra.join(', ')}`);
    console.error(
      '  An extra slug here is the defect this check was written for - a URL submitted to\n' +
        '  crawlers that no page on the site links to and no editorial entry backs.'
    );
  }
}

// The hub must not carry a second copy of the list. It has to IMPORT
// NEIGHBORHOODS; a re-introduced literal array is how the four surfaces drifted
// the first time.
//
// The first version of this tested `/\bNEIGHBORHOODS\b/` against the whole
// file, which passed on the word appearing in a comment - and the comment
// explaining this very fix is in that file, so the check certified itself.
// Match the import statement instead.
const hub = readFileSync(join(ROOT, 'src', 'pages', 'NeighborhoodsPage.tsx'), 'utf8');
const IMPORTS_INVENTORY =
  /import\s*\{[^}]*\bNEIGHBORHOODS\b[^}]*\}\s*from\s*['"][^'"]*lib\/neighborhoods['"]/;
if (!IMPORTS_INVENTORY.test(hub)) {
  failed = true;
  console.error(
    '\n[neighborhoods] src/pages/NeighborhoodsPage.tsx no longer imports NEIGHBORHOODS.\n' +
      '  The hub is the only page linking to these URLs; a local list there means the links\n' +
      '  and the sitemap can disagree again without anything noticing.'
  );
}

if (failed) process.exit(1);

console.log(
  `[neighborhoods] ${want.length} neighborhood(s) agree across the inventory, the prerender ` +
    `routes and the sitemap.`
);
