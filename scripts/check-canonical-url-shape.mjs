/**
 * SEO-021: the build output, the canonical tags and the sitemaps must all name
 * the SAME URL form. This gate is why that is checkable.
 *
 * WHY A UNIT TEST WAS NOT ENOUGH, which is the entire reason this file exists.
 *
 * SEO-004 shipped functions/__tests__/middleware-trailing-slash.test.mjs: 23
 * assertions over trailingSlashRedirect(), all passing, all correct about the
 * mapping they describe. Production did the opposite. The function was never
 * the thing that decided the URL - Cloudflare Pages was, and it decided from
 * the SHAPE OF THE BUILD OUTPUT, which appears nowhere in that test.
 *
 * So this checks the three artifacts that actually determine what a crawler
 * gets, together, and refuses to let them disagree:
 *
 *   1. dist/<route>.html exists and dist/<route>/index.html does NOT.
 *      Both present is the ambiguous case; only the second present is the
 *      2026-08-29 regression, where Pages 308s /events -> /events/.
 *   2. The canonical tag inside that file resolves to the unslashed URL.
 *   3. The sitemap <loc> for the route is that same unslashed URL.
 *
 * Pass --live <base> to add the assertion no static check can make: fetch each
 * canonical URL and require 200 with no redirect hop. That is the form the
 * 2026-08-31 audit used, and it is the only evidence that counts after a
 * deploy. Static mode runs in CI; live mode runs against a deployed URL.
 *
 * Exit 0 = agree. Exit 1 = disagree. Skips (0) when dist/ has no prerender.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { PRERENDER_ROUTES } from './prerender-routes.mjs';
import { prerenderOutputPath } from './prerender-output.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const liveFlag = process.argv.indexOf('--live');
const LIVE_BASE = liveFlag !== -1 ? process.argv[liveFlag + 1]?.replace(/\/+$/, '') : null;

/** The one form this site declares everywhere. "/" is the sole exception. */
const canonicalPathFor = (route) => (route === '/' ? '/' : route.replace(/\/+$/, ''));

const problems = [];

// --- 1 + 2: output shape and the canonical tag inside it ------------------
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[canonical-shape] dist/ not built - run npm run build first. Skipping.');
  process.exit(0);
}

const prerendered = PRERENDER_ROUTES.filter((r) => existsSync(prerenderOutputPath(DIST, r)));
if (prerendered.length === 0) {
  console.error('[canonical-shape] no prerendered routes in dist/ - prerender did not run. Skipping.');
  process.exit(0);
}

for (const route of PRERENDER_ROUTES) {
  const flat = prerenderOutputPath(DIST, route);
  const dirStyle = route === '/' ? null : join(DIST, route, 'index.html');

  if (!existsSync(flat)) {
    problems.push(`${route}: ${flat.slice(ROOT.length + 1)} missing - prerender wrote nothing for this route`);
    continue;
  }
  if (dirStyle && existsSync(dirStyle)) {
    problems.push(
      `${route}: BOTH ${route}.html and ${route}/index.html exist. Cloudflare Pages picks one and ` +
        `308s the other form; the site then has two live URLs for one page again.`,
    );
  }

  const html = readFileSync(flat, 'utf8');
  const href = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) {
    problems.push(`${route}: no <link rel="canonical"> in the prerendered HTML`);
    continue;
  }
  let declared;
  try {
    declared = new URL(href).pathname;
  } catch {
    problems.push(`${route}: canonical href is not an absolute URL (${href})`);
    continue;
  }
  const want = canonicalPathFor(route);
  if (declared !== want) {
    problems.push(
      `${route}: canonical declares ${declared}, but the build serves ${want}. ` +
        `A canonical pointing at a URL that redirects is the SEO-021 defect.`,
    );
  }
}

// --- 3: the sitemaps name the same form -----------------------------------
const staticSitemap = join(PUBLIC, 'sitemap-static.xml');
if (existsSync(staticSitemap)) {
  const xml = readFileSync(staticSitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) {
    problems.push('sitemap-static.xml has no <loc> entries - refusing to score it as agreeing');
  }
  for (const loc of locs) {
    let p;
    try {
      p = new URL(loc).pathname;
    } catch {
      problems.push(`sitemap-static.xml: <loc>${loc}</loc> is not an absolute URL`);
      continue;
    }
    if (p !== '/' && p.endsWith('/')) {
      problems.push(
        `sitemap-static.xml submits ${p}, a trailing-slash URL that the build 308s away from. ` +
          `Sitemaps must list the form that returns 200.`,
      );
    }
  }
}

// --- live: the only assertion that survives a wrong inference -------------
if (LIVE_BASE) {
  for (const route of PRERENDER_ROUTES) {
    const url = `${LIVE_BASE}${canonicalPathFor(route)}`;
    let res;
    try {
      res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Googlebot' } });
    } catch (err) {
      problems.push(`live ${url}: fetch failed (${err.message})`);
      continue;
    }
    if (res.status !== 200) {
      problems.push(
        `live ${url}: ${res.status}${res.headers.get('location') ? ` -> ${res.headers.get('location')}` : ''}. ` +
          `The canonical URL must return 200 with no hop.`,
      );
      continue;
    }
    const body = await res.text();
    const href = body.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && href.replace(/\/$/, '') !== url.replace(/\/$/, '') && !(route === '/' && href === `${LIVE_BASE}/`)) {
      problems.push(`live ${url}: served 200 but its canonical tag says ${href}`);
    }
  }
}

const scope = LIVE_BASE ? `${PRERENDER_ROUTES.length} routes, static + live ${LIVE_BASE}` : `${PRERENDER_ROUTES.length} routes, static`;
if (problems.length > 0) {
  console.error(`[canonical-shape] ${problems.length} disagreement(s) across build output, canonical tags and sitemap:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nSee scripts/prerender-output.mjs for the direction and why it is that one.');
  process.exit(1);
}
console.log(`[canonical-shape] build output, canonical tags and sitemap agree on the unslashed form (${scope}).`);
