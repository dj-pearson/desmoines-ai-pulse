#!/usr/bin/env node
/**
 * No prerendered page may ship a loading state (WEB-SEO-006).
 *
 * /restaurants shipped "Loading restaurants..." in its HTML, an ItemList with
 * numberOfItems 0, and its own description promising "200+ local restaurants" -
 * on EVERY build, to every crawler, until 2026-08-28. Nothing caught it, and the
 * reason nothing caught it is worth stating: every existing guard measured a
 * DIFFERENCE. check-dom-budget compares against a baseline, so a route that has
 * always been wrong looks stable. This one asserts an ABSOLUTE property, so a
 * page that was born broken fails on the first run.
 *
 * WHAT IT ASSERTS: no element carries aria-busy="true". SkeletonGroup
 * (src/components/ui/skeleton.tsx) sets it on every skeleton this app renders,
 * and nothing else sets it. A page that still has one at capture time is a page
 * whose data had not arrived - it will serve a skeleton to any client that does
 * not run JavaScript, which is the entire population prerendering exists for.
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

const files = walk(DIST).filter((f) => !f.includes(`${sep}assets${sep}`));

if (files.length === 0) {
  // A checker that finds no pages must not report success over them.
  console.error('[prerender-content] no index.html found under dist/ - refusing to pass.');
  process.exit(1);
}

// Matched on the attribute rather than on skeleton class names: aria-busy is
// what the component contracts to emit, class names are styling and change.
const BUSY = /aria-busy\s*=\s*["']true["']/i;

const failures = [];
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  if (!BUSY.test(html)) continue;
  let route = '/' + relative(DIST, file).split(sep).join('/');
  route = route.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');
  const occurrences = (html.match(new RegExp(BUSY.source, 'gi')) || []).length;
  failures.push({ route, occurrences });
}

console.log(`[prerender-content] ${files.length} prerendered page(s) checked for a shipped loading state.`);

if (failures.length === 0) {
  console.log('OK No page ships a skeleton.');
  process.exit(0);
}

console.error(`\nX ${failures.length} page(s) ship a loading skeleton:`);
for (const f of failures) console.error(`  ${f.route}  (aria-busy x${f.occurrences})`);
console.error(
  '\n  These serve a skeleton to every client that does not run JavaScript.\n' +
    '  The prerenderer waits for aria-busy to clear, so this means that wait timed\n' +
    '  out: the page fetches outside TanStack Query and took longer than the cap,\n' +
    '  or it never clears its loading state at all. See scripts/prerender.mjs.\n',
);
process.exit(1);
