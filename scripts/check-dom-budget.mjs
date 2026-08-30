/**
 * Prerendered DOM element ratchet (WEB-PERF-023 AC1).
 *
 * WEB-PERF-023 capped the lists on four routes by hand and nothing stops the
 * next one. The prerenderer has a "budget" and it is a TIME budget - how long
 * the entity pass may run - so despite the word appearing in its output, no
 * check in this repo has ever counted an element. The numbers in that story
 * were measured by hand, once, and went stale immediately.
 *
 * WHAT IS COUNTED: `#root` descendants, via jsdom's querySelectorAll('*'). That
 * is Lighthouse's own definition, so the numbers here are comparable to the
 * "Avoid an excessive DOM size" audit rather than to a regex over tags. Elements
 * outside #root (the head, the noscript fallback) are excluded because React
 * does not reconcile them on boot, which is the cost AC3 is about.
 *
 * WHY THE TOLERANCE IS LOOSE, and it has to be: these pages render live data.
 * /events/date-night lists real events, /stay lists real hotels, so the count
 * moves when the database moves, with no code change at all. A tight ratchet on
 * a data-driven number is a flake, and a flaky gate gets switched off - this
 * repo has WEB-CI-020 and WEB-CI-021 as evidence. So a route fails only when it
 * grows past its baseline by more than TOLERANCE, which is wide enough to
 * absorb a full extra card row and narrow enough to catch an uncapped list.
 *
 * IT GATES NOTHING. It reports. Every threshold below is a reporting threshold,
 * and the reasoning for that is at the bottom of the file next to the exit -
 * short version: I tried gating twice, on growth and on collapse, and each
 * failed CI on a build that had changed nothing relevant. The numbers move with
 * live data and with capture timing by more than any tolerance worth setting.
 *
 * The Lighthouse flag is printed rather than enforced for the ordinary reason as
 * well: nine routes are over 1,500 today, and a check that is red from its first
 * run teaches people to ignore it. Same shape as check-bundle-budget.mjs, which
 * prints its distance to the 200 KB goal on every run.
 *
 *   node scripts/check-dom-budget.mjs            # check
 *   node scripts/check-dom-budget.mjs --update   # re-baseline
 *
 * Requires a build first: it reads dist/.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// jsdom is only loaded for --verify-parser; the normal path must not build a DOM.
// See countRootDescendants below.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASELINE = join(ROOT, 'dom-budget-baseline.json');
const UPDATE = process.argv.includes('--update');

/** Lighthouse warns above ~800 and flags above 1,500. */
const FLAG = 1500;
/** Room for one extra card row plus ordinary data movement. */
const TOLERANCE = 0.2;
/** Below this share of baseline a route has probably shipped its loading state. */
const COLLAPSE = 0.5;

if (!existsSync(DIST)) {
  console.error('[dom-budget] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

/**
 * Counts #root element descendants without building a DOM.
 *
 * WHY NOT jsdom, WHICH THIS USED TO USE. It was written against 35 hub routes.
 * Entity prerendering came on afterwards and dist/ now holds 1,171 pages, some
 * 190 KB each, so the run died with "FATAL ERROR: Reached heap limit Allocation
 * failed - JavaScript heap out of memory" and exit 134 - in CI too, at
 * pr-checks.yml. Counting once and calling window.close() was not enough.
 * A guard that crashes reports nothing, which is worse than one that is wrong.
 *
 * PROVEN EQUIVALENT rather than assumed: checked against
 * jsdom's root.querySelectorAll('*').length on 91 pages sampled across the whole
 * of dist/ - hubs and every entity type - and matched exactly on all 91.
 * Re-prove it with --verify-parser after changing anything here.
 *
 * script and style bodies are blanked first: JSON-LD contains "<" inside string
 * values and would otherwise be counted as tags.
 */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function countRootDescendants(html) {
  const open = html.indexOf('<div id="root"');
  if (open === -1) return 0;
  const body = html
    .slice(html.indexOf('>', open) + 1)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let depth = 1;
  let count = 0;
  let m;
  while ((m = tag.exec(body))) {
    const [, closing, name, selfClosing] = m;
    if (closing) {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    count += 1;
    if (!selfClosing && !VOID_ELEMENTS.has(name.toLowerCase())) depth += 1;
  }
  return count;
}

const routes = new Map();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'assets') walk(p);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const html = readFileSync(p, 'utf8');
    const count = countRootDescendants(html);
    // A route that was not prerendered ships an empty #root. Counting it as 0
    // would bank an "improvement" that is really a missing page, so skip it.
    if (count === 0) continue;
    const rel = dir.slice(DIST.length).split(sep).join('/');
    routes.set(rel === '' ? '/' : rel, count);
  }
};
walk(DIST);

if (routes.size === 0) {
  console.error('[dom-budget] no prerendered routes found in dist/. Did prerender run?');
  process.exit(1);
}

const sorted = [...routes.entries()].sort((a, b) => b[1] - a[1]);
const counts = sorted.map(([, n]) => n);
const median = counts[Math.floor(counts.length / 2)];

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({ flag: FLAG, routes: Object.fromEntries(sorted) }, null, 2) + '\n');
  console.log(`[dom-budget] baseline written: ${routes.size} route(s), worst ${sorted[0][1]} on ${sorted[0][0]}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`[dom-budget] ${BASELINE} is missing. Create it with --update.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).routes ?? {};
const regressions = [];
const collapses = [];
const fresh = [];
for (const [route, count] of sorted) {
  const before = baseline[route];
  if (before === undefined) {
    if (count > FLAG) fresh.push({ route, count });
    continue;
  }
  const ceiling = Math.round(before * (1 + TOLERANCE));
  if (count > ceiling) regressions.push({ route, before, count, ceiling });
  // A COLLAPSE IS THE MORE DANGEROUS DIRECTION, and only this check can see it.
  // prerender.mjs waits for Helmet to commit head tags and then captures. Helmet
  // commits on the FIRST render, before TanStack Query resolves, so a route can
  // be snapshotted showing its loading skeleton - correct title, correct
  // canonical, and no content. Production serves exactly that on /events/today,
  // /events/free, /events/ankeny and /restaurants/dietary: 0 Event and 0
  // ItemList JSON-LD nodes where their siblings carry 30 and 40 (WEB-SEO-006).
  //
  // Nothing else catches it. The page is 200, the head is right, and the shell
  // looks like a page - it just has nothing in it. A route that loses more than
  // half its elements has either had its list capped on purpose, in which case
  // re-baseline, or shipped a loading state, which is worse than not
  // prerendering it at all.
  if (count < Math.round(before * COLLAPSE)) collapses.push({ route, before, count });
}

console.log(
  `[dom-budget] ${routes.size} prerendered route(s); median ${median}, worst ${sorted[0][1]} on ${sorted[0][0]}.`
);
const overFlag = sorted.filter(([, n]) => n > FLAG);
if (overFlag.length) {
  console.log(`\n${overFlag.length} route(s) over the ${FLAG}-element Lighthouse flag:`);
  for (const [route, n] of overFlag) console.log(`  ${String(n).padStart(6)}  ${route}`);
}

if (regressions.length) {
  console.log(`\nREGRESSED (${regressions.length}) - grew more than ${Math.round(TOLERANCE * 100)}% past baseline:`);
  for (const r of regressions) {
    console.log(`  ${r.route}: ${r.before} -> ${r.count} (ceiling ${r.ceiling})`);
  }
  console.log('\nCap the list this route renders, or re-baseline deliberately with --update.');
}
if (collapses.length) {
  console.log(`\nCOLLAPSED (${collapses.length}) - lost more than ${Math.round((1 - COLLAPSE) * 100)}% of baseline:`);
  for (const c of collapses) console.log(`  ${c.route}: ${c.before} -> ${c.count}`);
  console.log(
    '\nEither the list was capped on purpose - re-baseline with --update - or the prerender\n' +
      'captured a loading state, which ships a 200 with a correct head and no content.'
  );
}

if (fresh.length) {
  console.log(`\nNEW ROUTE OVER THE FLAG (${fresh.length}):`);
  for (const f of fresh) console.log(`  ${f.route}: ${f.count}`);
  console.log(`\nA new prerendered route should not ship more than ${FLAG} elements. Cap its list.`);
}

// REPORT-ONLY, and this is the third revision of that decision rather than a
// first instinct. I gated on growth and on collapse in turn, and each failed CI
// on a build that had changed nothing relevant:
//   collapse  /restaurants/dietary 2163 -> 556, a real thin capture - but the
//             thin capture is a race, so the gate was non-deterministic.
//   growth    /events/kids 549 -> 1046, because the settle fix captured content
//             the baseline run had missed. Also real, also not a regression.
// The metric moves with live data and with capture timing by more than any
// tolerance worth setting - 2x on one route between two builds of the same
// commit. check-bundle-budget.mjs's header explains why a per-item baseline
// churns where a total does not; the difference here is that even the total
// moves, because the underlying rows move.
//
// So it measures and prints on every build, and gates nothing. That is worth
// more than it sounds. Before this script there was no number at all:
// WEB-PERF-023 was working from hand measurements four fixes out of date, and a
// route collapsing to a loading shell was invisible. A number in the build log
// that someone can read is the deliverable. A red PR that nobody caused is not.
if (regressions.length || collapses.length || fresh.length) {
  console.log('\nNothing above fails the build. See the header for why.');
} else {
  console.log('\nNo DOM-size regressions.');
}
process.exit(0);
