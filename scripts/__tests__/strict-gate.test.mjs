#!/usr/bin/env node
/**
 * Offline checks for strictGateFailures (SEO-001).
 *
 *   node scripts/__tests__/strict-gate.test.mjs
 *
 * This gate decides whether a captured entity page is frozen into dist/ or left
 * as an SPA shell, so it has to be wrong in neither direction:
 *
 *   - too permissive and it publishes ~1,070 copies of the homepage as static
 *     HTML, which is strictly worse than the shell it replaced, because Google
 *     renders the shell correctly and will not re-render a static file;
 *   - too strict and it rejects real pages, which silently removes them from
 *     the JS-less crawler's view while the build stays green.
 *
 * So every rejection case below is paired with an acceptance case that differs
 * in ONE thing. A check that only ever proves the gate fires is a check that
 * would still pass if the gate rejected everything.
 */
import { strictGateFailures } from '../lazy-preload-patterns.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const SHELL_TITLE = 'Things to Do in Des Moines This Weekend | Des Moines Insider';

/** A page that rendered as itself: own title, own canonical, real JSON-LD. */
const good = (route, title) => `<!doctype html><html><head>
<title>${title}</title>
<link rel="canonical" href="https://desmoinesinsider.com${route}" data-rh="true">
<script type="application/ld+json">{"@type":"Restaurant","name":"${title}"}</script>
</head><body><div id="root"><h1>${title}</h1></div></body></html>`;

console.log('\nstrictGateFailures — accepts a page that rendered as itself');

check(
  'a real restaurant page passes',
  strictGateFailures(good('/restaurants/atlas-caf', 'Atlas Cafe | Des Moines Insider'), '/restaurants/atlas-caf', SHELL_TITLE).length === 0,
  JSON.stringify(strictGateFailures(good('/restaurants/atlas-caf', 'Atlas Cafe | Des Moines Insider'), '/restaurants/atlas-caf', SHELL_TITLE)),
);

check(
  'a trailing slash on the canonical is not a failure',
  strictGateFailures(
    good('/restaurants/atlas-caf/', 'Atlas Cafe | Des Moines Insider'),
    '/restaurants/atlas-caf',
    SHELL_TITLE,
  ).length === 0,
);

check(
  'a relative canonical resolves and passes',
  strictGateFailures(
    `<html><head><title>Marvs | DMI</title><link rel="canonical" href="/restaurants/marvs">
     <script type="application/ld+json">{"@type":"Restaurant"}</script></head><body></body></html>`,
    '/restaurants/marvs',
    SHELL_TITLE,
  ).length === 0,
);

check(
  'single-quoted attributes parse',
  strictGateFailures(
    `<html><head><title>Marvs | DMI</title><link rel='canonical' href='/restaurants/marvs'>
     <script type='application/ld+json'>{"@type":"Restaurant"}</script></head><body></body></html>`,
    '/restaurants/marvs',
    SHELL_TITLE,
  ).length === 0,
);

console.log('\nstrictGateFailures — rejects the shell (the failure this exists for)');

// THE PRODUCTION SYMPTOM, reproduced. Measured 2026-08-28 as GPTBot:
// /restaurants/atlas-caf returned the homepage title, the homepage H1 and zero
// JSON-LD, with a correct canonical. The canonical being right is what makes
// this case dangerous — a canonical-only check would have waved it through.
const productionShell = `<!doctype html><html><head>
<title>${SHELL_TITLE}</title>
<link rel="canonical" href="https://desmoinesinsider.com/restaurants/atlas-caf">
</head><body><div id="root"><h1>Good Afternoon!Find things to do in Des Moines, right now</h1></div></body></html>`;

const shellResult = strictGateFailures(productionShell, '/restaurants/atlas-caf', SHELL_TITLE);
check('the real production shell is rejected', shellResult.length > 0, JSON.stringify(shellResult));
check(
  'it is rejected for the shell title AND the missing JSON-LD, not one of them',
  shellResult.length === 2 &&
    shellResult.some((f) => f.includes('shell title')) &&
    shellResult.some((f) => f.includes('no JSON-LD')),
  JSON.stringify(shellResult),
);

check(
  'a page with no title at all is rejected',
  strictGateFailures(
    '<html><head><link rel="canonical" href="/x"><script type="application/ld+json">{}</script></head><body></body></html>',
    '/x',
    SHELL_TITLE,
  ).some((f) => f.includes('no <title>')),
);

check(
  'a page with no canonical is rejected',
  strictGateFailures(
    '<html><head><title>Real Page</title><script type="application/ld+json">{}</script></head><body></body></html>',
    '/restaurants/x',
    SHELL_TITLE,
  ).some((f) => f === 'no canonical'),
);

check(
  "another page's canonical is rejected, and the message names both paths",
  (() => {
    const f = strictGateFailures(good('/restaurants/somebody-else', 'Real | DMI'), '/restaurants/atlas-caf', SHELL_TITLE);
    return f.some((x) => x.includes('/restaurants/somebody-else') && x.includes('/restaurants/atlas-caf'));
  })(),
);

check(
  'a page with no JSON-LD is rejected even when title and canonical are right',
  strictGateFailures(
    '<html><head><title>Real Page | DMI</title><link rel="canonical" href="/restaurants/x"></head><body></body></html>',
    '/restaurants/x',
    SHELL_TITLE,
  ).some((f) => f === 'no JSON-LD'),
);

console.log('\nstrictGateFailures — the checks are independent, not one check wearing three hats');

// If these three all collapsed into "is the title wrong", the suite above would
// still pass. Each case below breaks exactly one thing and must report exactly
// one failure.
for (const [name, html, route] of [
  [
    'only the canonical is wrong',
    good('/restaurants/wrong', 'Atlas Cafe | DMI'),
    '/restaurants/atlas-caf',
  ],
  [
    'only the JSON-LD is missing',
    '<html><head><title>Atlas Cafe | DMI</title><link rel="canonical" href="/restaurants/atlas-caf"></head><body></body></html>',
    '/restaurants/atlas-caf',
  ],
]) {
  const f = strictGateFailures(html, route, SHELL_TITLE);
  check(`${name} -> exactly one failure`, f.length === 1, JSON.stringify(f));
}

console.log('\nstrictGateFailures — a null shellTitle disables only the title check');

// The shell title is read from the build output. If that read ever fails the
// gate must not start rejecting every page for a reason it cannot evaluate, and
// must not start accepting shells silently either — the other two checks stand.
check(
  'null shellTitle: a real page still passes',
  strictGateFailures(good('/restaurants/x', 'Real | DMI'), '/restaurants/x', null).length === 0,
);
check(
  'null shellTitle: a shell with no JSON-LD is still caught by the other checks',
  strictGateFailures(productionShell, '/restaurants/atlas-caf', null).some((f) => f === 'no JSON-LD'),
);

console.log(
  `\n${failures === 0 ? 'PASS' : 'FAIL'}: strict-gate — ${failures} failing check(s)\n`,
);
process.exit(failures === 0 ? 0 : 1);
