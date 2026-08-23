#!/usr/bin/env node
/**
 * The SPA fallback must not claim to be the homepage (WEB-SEO-006).
 *
 * WHAT WENT WRONG. functions/_middleware.ts serves `/` for every unmatched
 * route, and `/` is prerendered - so an event, restaurant or attraction URL
 * returned the homepage's HTML verbatim, canonical included. Measured in
 * production 2026-08-22: 884 sitemapped URLs each answering with a
 * byte-identical copy of the homepage, every one carrying
 * `<link rel="canonical" href="https://desmoinesinsider.com/">`. That is an
 * explicit instruction to treat 884 distinct URLs as one page.
 *
 * WHY A CHECK AND NOT A TEST. The rewrite runs inside Cloudflare's HTMLRewriter,
 * which does not exist outside the Workers runtime, so the transform itself
 * cannot be executed here. What CAN be asserted offline is the property that
 * actually regressed: that every place the middleware hands back the shell goes
 * through the canonical correction. A third path added later that serves the
 * shell raw is exactly how this comes back, and it is invisible in review
 * because each line looks fine on its own.
 *
 * TWO ASSERTIONS:
 *   1. Every `ASSETS.fetch(new URL("/"` in the middleware is either inside the
 *      rewrite helper or immediately handed to it. This one always runs.
 *   2. If dist/ has been built, the homepage shell still contains the canonical
 *      the rewrite targets. A selector that matches nothing is a rewrite that
 *      does nothing, and it would fail silently.
 *
 * Usage: node scripts/check-spa-fallback-canonical.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIDDLEWARE = join(ROOT, 'functions/_middleware.ts');
const DIST_SHELL = join(ROOT, 'dist/index.html');

/** The helper that performs the correction. Renaming it should fail loudly. */
const HELPER = 'withSelfCanonical';

const failures = [];

if (!existsSync(MIDDLEWARE)) {
  console.error(`[spa-canonical] ${MIDDLEWARE} not found - refusing to pass.`);
  process.exit(1);
}

const src = readFileSync(MIDDLEWARE, 'utf8');
const lines = src.split('\n');

// --- 1. Every shell fetch is corrected ---------------------------------------
if (!src.includes(`function ${HELPER}`)) {
  failures.push(
    `${HELPER} is gone from functions/_middleware.ts. Either the correction was ` +
      `removed, or it was renamed and this check needs updating - both need a look.`
  );
}

const shellFetch = /ASSETS\.fetch\(\s*new URL\(\s*["']\/["']/;
const shellFetchLines = [];
lines.forEach((line, i) => {
  if (shellFetch.test(line)) shellFetchLines.push(i);
});

if (shellFetchLines.length === 0) {
  failures.push(
    'No ASSETS.fetch(new URL("/")) found in the middleware. The SPA fallback moved; ' +
      'this check no longer covers it.'
  );
}

// The shell must never be RETURNED straight from the fetch. Assigning it and
// transforming it is the only correct shape; `return ASSETS.fetch(...)` is
// literally the line this defect shipped as, and it is the one thing a reviewer
// would read as obviously fine.
lines.forEach((line, i) => {
  if (shellFetch.test(line) && /\breturn\b/.test(line)) {
    failures.push(
      `functions/_middleware.ts:${i + 1} returns the shell directly. It carries the ` +
        `homepage's canonical, og:url and JSON-LD, so the route answers as though it ` +
        `IS the homepage. Assign it and pass it through ${HELPER}.`
    );
  }
});

// Each remaining shell fetch has to reach a canonical rewrite. Both shapes are
// accepted: the helper, or an inline HTMLRewriter chain that names the selector.
for (const i of shellFetchLines) {
  if (/\breturn\b/.test(lines[i])) continue; // already reported above
  const after = lines.slice(i, i + 40).join('\n');
  const corrected = after.includes(HELPER) || after.includes('link[rel="canonical"]');
  if (!corrected) {
    failures.push(
      `functions/_middleware.ts:${i + 1} fetches the shell but nothing within the ` +
        `next 40 lines corrects its canonical.`
    );
  }
}

// --- 2. The rewrite has something to rewrite ---------------------------------
if (existsSync(DIST_SHELL)) {
  const html = readFileSync(DIST_SHELL, 'utf8');
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/i);
  if (!canonical) {
    failures.push(
      'dist/index.html has no <link rel="canonical">. The middleware rewrite ' +
        'targets that selector, so it would now be a no-op - and a no-op rewrite ' +
        'fails silently.'
    );
  } else {
    const jsonLd = (html.match(/<script[^>]*type="application\/ld\+json"/gi) ?? []).length;
    console.log(
      `[spa-canonical] built shell: 1 canonical, ${jsonLd} ld+json block(s) to strip.`
    );
  }
} else {
  console.log('[spa-canonical] dist/ not built; skipping the shell assertion.');
}

console.log(`[spa-canonical] ${shellFetchLines.length} shell-serving path(s) checked.`);

if (failures.length > 0) {
  console.error(`\nX ${failures.length} SPA-fallback failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\n  See WEB-SEO-006.\n');
  process.exit(1);
}

console.log('\nOK Every SPA-fallback path corrects the homepage canonical.');
