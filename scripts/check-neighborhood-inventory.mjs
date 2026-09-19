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

// -------------------------------------------------------------------------
// The suburb inventory behind /events/<slug> (WEB-SEO-036 AC5).
//
// PlaceCrossLinks links /neighborhoods/<slug> to /events/<slug> when the second
// one exists, and it decides that from src/lib/suburbs.ts. App.tsx mounts those
// seven paths ONE AT A TIME with no catch-all behind them, so an entry added to
// suburbs.ts without a matching route is a link straight to a 404 - and the
// link renders on a prerendered, sitemapped page, so a crawler finds it before
// anyone else does.
const SUBURBS_FILE = join(ROOT, 'src', 'lib', 'suburbs.ts');
const suburbSrc = readFileSync(SUBURBS_FILE, 'utf8');
const suburbBody = suburbSrc.slice(suburbSrc.indexOf('export const SUBURBS'));
const suburbSlugs = [...suburbBody.matchAll(/^  "?([a-z0-9-]+)"?: \{$/gm)].map((m) => m[1]);
if (suburbSlugs.length === 0) {
  console.error(
    '[neighborhoods] read 0 slugs from src/lib/suburbs.ts. The file changed shape;\n' +
      'update the matcher here rather than deleting this check.'
  );
  process.exit(1);
}

const appSrc = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
// Matched on the ELEMENT, not on the path. App.tsx also mounts /events/today,
// /events/near-me, /events/free and others under that prefix; a path-only match
// needs a hand-maintained list of which of them are not suburbs, and the first
// version of this check shipped with near-me missing from it. "Routes to
// EventsByLocation" is the actual question and it maintains itself. The bridge
// between the two attributes is bounded because prettier wraps this element
// over three lines when the slug is long enough.
const routedSuburbs = [
  ...appSrc.matchAll(/path="\/events\/([a-z0-9-]+)"[\s\S]{0,40}?element=\{<EventsByLocation/g),
].map((m) => m[1]);

const missingRoute = suburbSlugs.filter((slug) => !routedSuburbs.includes(slug));
if (missingRoute.length > 0) {
  failed = true;
  console.error(
    `\n[neighborhoods] src/lib/suburbs.ts lists ${missingRoute.join(', ')} with no matching\n` +
      '  <Route path="/events/<slug>"> in src/App.tsx. PlaceCrossLinks will render a link to a 404.'
  );
}

const orphanRoute = routedSuburbs.filter((slug) => !suburbSlugs.includes(slug));
if (orphanRoute.length > 0) {
  failed = true;
  console.error(
    `\n[neighborhoods] src/App.tsx routes /events/${orphanRoute.join(', /events/')} to\n` +
      '  EventsByLocation, but src/lib/suburbs.ts has no entry - the page renders "Location Not Found".'
  );
}

// EventsByLocation must IMPORT the inventory. A local copy there is how the
// neighborhood lists drifted in the first place, and this file exists because
// of that.
const byLocation = readFileSync(join(ROOT, 'src', 'pages', 'EventsByLocation.tsx'), 'utf8');
if (!/import\s*\{[^}]*\bSUBURBS\b[^}]*\}\s*from\s*['"][^'"]*lib\/suburbs['"]/.test(byLocation)) {
  failed = true;
  console.error(
    '\n[neighborhoods] src/pages/EventsByLocation.tsx no longer imports SUBURBS from\n' +
      '  @/lib/suburbs. A local copy there and the cross-links can disagree silently.'
  );
}

if (failed) process.exit(1);

console.log(
  `[neighborhoods] ${want.length} neighborhood(s) agree across the inventory, the prerender ` +
    `routes and the sitemap; ${suburbSlugs.length} suburb page(s) agree with App.tsx's routes.`
);
