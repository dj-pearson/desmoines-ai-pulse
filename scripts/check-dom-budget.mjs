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
 * IT DOES NOT GATE ON THE LIGHTHOUSE FLAG. Eight routes are over 1,500 today and
 * a check that is red from the first run teaches people to ignore it. The
 * distance to the flag is printed on every run so the target does not disappear,
 * which is the same shape as check-bundle-budget.mjs.
 *
 *   node scripts/check-dom-budget.mjs            # check
 *   node scripts/check-dom-budget.mjs --update   # re-baseline
 *
 * Requires a build first: it reads dist/.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASELINE = join(ROOT, 'dom-budget-baseline.json');
const UPDATE = process.argv.includes('--update');

/** Lighthouse warns above ~800 and flags above 1,500. */
const FLAG = 1500;
/** Room for one extra card row plus ordinary data movement. */
const TOLERANCE = 0.2;

if (!existsSync(DIST)) {
  console.error('[dom-budget] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
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
    const root = new JSDOM(html).window.document.getElementById('root');
    // A route that was not prerendered ships an empty #root. Counting it as 0
    // would bank a "improvement" that is really a missing page, so skip it.
    if (!root || root.querySelectorAll('*').length === 0) continue;
    const rel = dir.slice(DIST.length).split(sep).join('/');
    routes.set(rel === '' ? '/' : rel, root.querySelectorAll('*').length);
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
const fresh = [];
for (const [route, count] of sorted) {
  const before = baseline[route];
  if (before === undefined) {
    if (count > FLAG) fresh.push({ route, count });
    continue;
  }
  const ceiling = Math.round(before * (1 + TOLERANCE));
  if (count > ceiling) regressions.push({ route, before, count, ceiling });
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
if (fresh.length) {
  console.log(`\nNEW ROUTE OVER THE FLAG (${fresh.length}):`);
  for (const f of fresh) console.log(`  ${f.route}: ${f.count}`);
  console.log(`\nA new prerendered route should not ship more than ${FLAG} elements. Cap its list.`);
}

if (regressions.length || fresh.length) process.exit(1);
console.log('\nNo DOM-size regressions.');
process.exit(0);
