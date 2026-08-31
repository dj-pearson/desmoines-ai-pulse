#!/usr/bin/env node
/**
 * SEO-028: a detail page's loading state must still declare its canonical.
 *
 * Every detail page put its canonical inside <SEOHead>, which renders only once
 * the entity resolves, while the `if (isLoading)` branch above it returned a
 * skeleton with no canonical at all. In a browser the fetch finishes and Helmet
 * fills the head in, so this is invisible. Under prerendering the capture can
 * land mid-fetch, the page has no canonical, and the strict gate correctly
 * refuses to publish it - so it ships as an SPA shell instead.
 *
 * SEO-027 measured the cost: a clean build refused 7 of the top 100 entity
 * pages, including /restaurants/bonchon, the highest-impression URL on the site
 * at 10,473. The same tree rendered 100/100 when idle. The pages that drop are
 * not the broken ones - they are whichever were in flight when the machine was
 * busiest, so a slower CI box loses more of them.
 *
 * A unit test on RouteCanonical would not catch a regression here, because the
 * regression is someone adding a NEW detail page and not calling it, or moving
 * the canonical back behind the fetch. So this asserts the shape of the pages
 * themselves: every file with an isLoading early-return must emit a canonical
 * inside that branch, from a route param rather than from loaded data.
 *
 * Run: node scripts/check-loading-canonical.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'src', 'pages');

/**
 * Pages that legitimately have no canonical in their loading state.
 * Keep this list short and say why for each.
 */
const EXEMPT = new Map([
  // Authenticated advertiser and admin routes. They sit behind ProtectedRoute,
  // are not in any sitemap and are never prerendered, so there is no capture to
  // race and no canonical to declare. Exempt because they are unreachable to a
  // crawler, not because the pattern is acceptable.
  ['AdminCampaignDetail.tsx', 'admin route, behind ProtectedRoute, not prerendered'],
  ['CampaignDetail.tsx', 'advertiser route, requires auth, not prerendered'],
  ['UploadCreatives.tsx', 'advertiser route, requires auth, not prerendered'],
]);

const problems = [];
const checked = [];

for (const file of readdirSync(PAGES).filter((f) => f.endsWith('.tsx'))) {
  const src = readFileSync(join(PAGES, file), 'utf8');

  // Only detail pages are at risk: they read a route param and fetch by it.
  const readsRouteParam = /useParams\s*(<[^>]*>)?\s*\(\)/.test(src);
  const hasLoadingReturn = /if\s*\(\s*isLoading\s*\)\s*\{\s*\n\s*return/.test(src);
  if (!readsRouteParam || !hasLoadingReturn) continue;
  if (EXEMPT.has(file)) continue;

  checked.push(file);

  // Take the loading branch: from `if (isLoading) {` to the closing of that
  // early return, bounded by the next top-level `if (` at the same indent.
  const start = src.search(/if\s*\(\s*isLoading\s*\)\s*\{/);
  const rest = src.slice(start);
  const end = rest.search(/\n  if \(/);
  const branch = end === -1 ? rest.slice(0, 4000) : rest.slice(0, end);

  const emitsCanonical =
    /<RouteCanonical\b/.test(branch) || /rel=["']canonical["']/.test(branch);

  if (!emitsCanonical) {
    problems.push(
      `${file}: the isLoading branch returns without a canonical. A capture that ` +
      `lands mid-fetch will be refused by the strict gate and ship as a shell. ` +
      `Add <RouteCanonical path={...} /> built from the route param.`
    );
    continue;
  }

  // A canonical built from fetched data has the same race it is meant to fix.
  const fromData = branch.match(/<RouteCanonical[^>]*path=\{`[^`]*\$\{(\w+)[.?]/);
  if (fromData) {
    problems.push(
      `${file}: the loading canonical is built from \`${fromData[1]}\`, which is the ` +
      `data being awaited. Build it from the route param instead.`
    );
  }
}

if (problems.length) {
  console.error(`[loading-canonical] ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nSee src/components/RouteCanonical.tsx for why this exists.');
  process.exit(1);
}

console.log(
  `[loading-canonical] OK ${checked.length} detail page(s) declare a canonical ` +
  `before their data arrives: ${checked.join(', ')}.`
);
