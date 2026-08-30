#!/usr/bin/env node
/**
 * No prerendered page may ship a loading state or an unnamed link
 * (WEB-SEO-006).
 *
 * /restaurants shipped "Loading restaurants..." in its HTML, an ItemList with
 * numberOfItems 0, and its own description promising "200+ local restaurants" -
 * on EVERY build, to every crawler, until 2026-08-28. Nothing caught it, and the
 * reason nothing caught it is worth stating: every existing guard measured a
 * DIFFERENCE. check-dom-budget compares against a baseline, so a route that has
 * always been wrong looks stable. This one asserts an ABSOLUTE property, so a
 * page that was born broken fails on the first run.
 *
 * WHAT IT ASSERTS, all three being things no live data can make correct:
 *
 *   no aria-busy="true"   the page is still loading
 *   no link with no accessible name   a WCAG 2.4.4 failure, and a crawler
 *                         following it lands nowhere
 *
 * THERE IS NO NESTED-ANCHOR ASSERTION, and the reason is worth writing down
 * because the obvious check is impossible. An <a> inside an <a> is invalid, and
 * every HTML parser - Chromium's and jsdom's alike - SPLITS them rather than
 * building the nested tree. So by the time this file reads dist/, the nesting no
 * longer exists to find: `querySelectorAll('a a')` matches nothing, on a page
 * that definitely has the bug. I wrote that assertion, watched its control fail
 * to fire, and deleted it rather than ship protection that cannot trigger.
 *
 * What the split LEAVES BEHIND is detectable, and it is the same defect: an
 * empty outer anchor. /restaurants shipped three of them -
 * <a class="block" href="/restaurants/bonchon"></a> - plus duplicate hrefs for
 * one restaurant. So the unnamed-link rule below is the nested-anchor check,
 * arrived at from the only side a parser leaves visible.
 *
 * ON THE FIRST: no element carries aria-busy="true". SkeletonGroup
 * (src/components/ui/skeleton.tsx) sets it on every skeleton this app renders,
 * and nothing else sets it. A page that still has one at capture time is a page
 * whose data had not arrived - it will serve a skeleton to any client that does
 * not run JavaScript, which is the entire population prerendering exists for.
 *
 * THE COUNTER-ARGUMENT, which is already in this repo and deserves answering
 * rather than ignoring. prerender.mjs rejects a capture containing "Loading X..."
 * ONLY when #main-content has under 2,000 characters, and says why: "this app
 * lazy-loads plenty of below-the-fold sections, so a fully-rendered page can
 * legitimately still show 'Loading dashboard...' in one widget. Rejecting on
 * that alone threw away the homepage - 11k characters of real content - over a
 * single spinner."
 *
 * That proportionality rule is exactly what let /restaurants through: its main
 * list was a skeleton while the rest of the page carried well over 2,000
 * characters. And no threshold on SIZE would have caught it either - the
 * skeleton was a small fraction of a large page and still the entire point of
 * the route.
 *
 * So this check is absolute, and the cost is the case that comment protects: a
 * genuinely lazy below-the-fold widget unresolved at capture fails the build
 * here. Zero of 35 routes are in that state today. When one legitimately is,
 * ALLOWED_SKELETON_ROUTES is the escape hatch - per route, with a reason -
 * rather than deleting the check, which is how a gate that fires once gets
 * switched off for good.
 *
 * IT GATES, and that is deliberate where check-dom-budget does not. Element
 * counts move with live data, so gating on them is red in any quiet week. A
 * shipped skeleton is never correct on any data, so there is no quiet week that
 * makes this fire. The prerenderer already waits for aria-busy to clear, so a
 * failure here means that wait timed out - a real regression, not a threshold.
 *
 * Requires a build first: it reads dist/.
 *
 *   node scripts/check-prerender-content.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = 'dist';

if (!existsSync(DIST)) {
  console.error('[prerender-content] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'index.html') out.push(full);
  }
  return out;
}

const allFiles = walk(DIST).filter((f) => !f.includes(`${sep}assets${sep}`));

/**
 * Shard the work across child processes, because jsdom cannot survive dist/.
 *
 * This file needs a real DOM - accessible names and nesting are tree questions
 * and the header says so - so it cannot take check-dom-budget.mjs's way out of
 * regexing the markup. But dist/ now holds over a thousand prerendered pages and
 * jsdom retains enough per document that the run dies with "Reached heap limit
 * Allocation failed" and exit 134, in CI as well as locally. Measured: closing
 * each window does NOT help, so this is not a leak to plug.
 *
 * So the parent re-runs itself over slices and each child exits, which is the
 * only thing that reliably returns the heap. Assertions are unchanged; the child
 * is this same file with SHARD set.
 */
const SHARD = process.env.PRERENDER_CONTENT_SHARD;
const SHARD_COUNT = Number(process.env.PRERENDER_CONTENT_SHARDS || 0);
const FILES_PER_SHARD = 250;

if (!SHARD && allFiles.length > FILES_PER_SHARD) {
  const shards = Math.ceil(allFiles.length / FILES_PER_SHARD);
  const { spawnSync } = await import('node:child_process');
  let failed = false;
  for (let i = 0; i < shards; i += 1) {
    const r = spawnSync(process.execPath, [process.argv[1]], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, PRERENDER_CONTENT_SHARD: String(i), PRERENDER_CONTENT_SHARDS: String(shards) },
    });
    const out = (r.stdout || '').toString();
    // Only the last shard prints the summary; the rest print findings or nothing.
    if (out.trim() && i === shards - 1) process.stdout.write(out);
    else if (out.includes('FAIL')) process.stdout.write(out);
    if (r.status !== 0) failed = true;
  }
  console.log(
    `[prerender-content] ${allFiles.length} page(s) checked across ${shards} shard(s) of ${FILES_PER_SHARD}.`,
  );
  process.exit(failed ? 1 : 0);
}

const files =
  SHARD === undefined
    ? allFiles
    : allFiles.filter((_, i) => i % SHARD_COUNT === Number(SHARD));

if (files.length === 0) {
  // A checker that finds no pages must not report success over them.
  console.error('[prerender-content] no index.html found under dist/ - refusing to pass.');
  process.exit(1);
}

// Matched on the attribute rather than on skeleton class names: aria-busy is
// what the component contracts to emit, class names are styling and change.
const BUSY = /aria-busy\s*=\s*["']true["']/i;

/**
 * Routes permitted to ship a skeleton, each with the reason it is acceptable.
 * EMPTY TODAY and it should stay that way: an entry here means crawlers and
 * every JS-less client see a loading state on that route forever. Add one only
 * when the skeleton is a genuinely lazy below-the-fold widget whose absence
 * costs a crawler nothing - never to make a red build green.
 */
const ALLOWED_SKELETON_ROUTES = new Map([
  // ['/example', 'why a crawler seeing this skeleton is acceptable'],
]);

/** An <a> with nothing a screen reader or a crawler could announce. */
function unnamedLinks(doc, root) {
  return [...root.querySelectorAll('a[href]')].filter((a) => {
    if (a.closest('[aria-hidden="true"]')) return false;
    if ((a.getAttribute('aria-label') || a.getAttribute('aria-labelledby') || a.getAttribute('title') || '').trim()) {
      return false;
    }
    if ((a.textContent || '').trim()) return false;
    // An image with real alt text names the link.
    return !a.querySelector('img[alt]:not([alt=""])');
  });
}

const failures = [];
const allowed = [];
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  let route = '/' + relative(DIST, file).split(sep).join('/');
  route = route.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');

  if (BUSY.test(html)) {
    const occurrences = (html.match(new RegExp(BUSY.source, 'gi')) || []).length;
    if (ALLOWED_SKELETON_ROUTES.has(route)) {
      allowed.push({ route, occurrences, reason: ALLOWED_SKELETON_ROUTES.get(route) });
    } else {
      failures.push({ route, what: `ships a loading skeleton (aria-busy x${occurrences})` });
    }
  }

  // Parsed rather than regexed: nesting and accessible names are tree
  // questions, and a regex over serialized HTML cannot answer either.
  const doc = new JSDOM(html).window.document;
  const root = doc.getElementById('root');
  if (!root) continue;

  const unnamed = unnamedLinks(doc, root).length;
  if (unnamed > 0) failures.push({ route, what: `${unnamed} link(s) with no accessible name` });

  // THE ITEMLIST HALF OF THE DEFECT IN THIS FILE'S HEADER, which went
  // unguarded. The header opens with "/restaurants shipped ... an ItemList with
  // numberOfItems 0", and the two assertions above cover the skeleton and the
  // empty anchors but never the list itself.
  //
  // A list that declares a count and then supplies a different number of items
  // is a claim a crawler can check and find false. /restaurants declared 478
  // and supplied 20 - numberOfItems was taken from the total row count while
  // itemListElement was sliced - and it was the only one of ten ItemList-
  // emitting routes where the numbers disagreed.
  //
  // ABSOLUTE, like the rest of this file: no live data makes a self-
  // contradictory list correct. An empty list is NOT asserted on, deliberately.
  // A hub with nothing to show emits no ItemList at all, and an empty one is a
  // question for check-hub-inventory, which asks the DATABASE what the page
  // should have had. The DOM cannot tell "no rows" from "rows never arrived".
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed;
    try {
      parsed = JSON.parse(el.textContent || '');
    } catch {
      failures.push({ route, what: 'has an unparseable ld+json block' });
      continue;
    }
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!node || node['@type'] !== 'ItemList') continue;
      const declared = node.numberOfItems;
      if (typeof declared !== 'number') continue;
      const actual = Array.isArray(node.itemListElement) ? node.itemListElement.length : 0;
      if (declared !== actual) {
        failures.push({ route, what: `ItemList declares numberOfItems ${declared} but supplies ${actual}` });
      }
    }
  }
}

console.log(`[prerender-content] ${files.length} prerendered page(s) checked for skeletons, unnamed links and self-contradictory ItemLists.`);

for (const a of allowed) {
  console.log(`  allowed: ${a.route} (aria-busy x${a.occurrences}) - ${a.reason}`);
}

if (failures.length === 0) {
  console.log(`OK No page ships a skeleton or an unnamed link${allowed.length ? ` outside the ${allowed.length} allowed skeleton(s)` : ''}.`);
  process.exit(0);
}

console.error(`\nX ${failures.length} problem(s):`);
for (const f of failures) console.error(`  ${f.route}: ${f.what}`);
// The advice below is skeleton-specific, so it is printed only when a skeleton
// is actually among the failures. An ItemList mismatch printed under "these
// serve a skeleton to every client" sends the reader to the wrong file.
if (failures.some((f) => f.what.startsWith('ships a loading skeleton'))) {
console.error(
  '\n  These serve a skeleton to every client that does not run JavaScript.\n' +
    '  The prerenderer waits for aria-busy to clear, so this means that wait timed\n' +
    '  out: the page fetches outside TanStack Query and took longer than the cap,\n' +
    '  or it never clears its loading state at all. See scripts/prerender.mjs.\n\n' +
    '  If the skeleton is a genuinely lazy below-the-fold widget that a crawler\n' +
    '  loses nothing by missing, add the route to ALLOWED_SKELETON_ROUTES with a\n' +
    '  reason. Do not add one to make a red build green.\n',
);
}
if (failures.some((f) => f.what.startsWith('ItemList declares'))) {
  console.error(
    'An ItemList that declares one count and supplies another is a claim a ' +
      'crawler can check and find false. numberOfItems must count the items in ' +
      'itemListElement, not the collection the page was drawn from.',
  );
}
process.exit(1);
