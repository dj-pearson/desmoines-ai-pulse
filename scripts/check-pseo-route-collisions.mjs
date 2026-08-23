#!/usr/bin/env node
/**
 * A published pSEO slug must not collide with a hand-built route (WEB-SEO-013 AC7).
 *
 * WHY THIS NEEDS A SCRIPT. pseo_pages rows are DATA. A collision between a
 * generated page and a hand-built React route is invisible to every static
 * check in this repo - nothing compares a database row to src/App.tsx - and the
 * symptom is two URLs competing for one query, which is the doorway-page
 * failure the whole story is trying to avoid. There is already one precedent in
 * public/_redirects: /things-to-do/tourists was 301'd to /visitors-guide under
 * WEB-UX-016 because the generated page duplicated a hand-built one. AC7 asks
 * for the rest of that audit; nobody had run it.
 *
 * TWO KINDS OF HIT, reported separately because the fix differs:
 *   EXACT      a published slug equals a literal route path. Two pages, one
 *              URL. This fails the check.
 *   SHADOWED   a published slug is matched by a parameterised route such as
 *              /restaurants/:slug. The detail route will try to resolve the
 *              slug as an entity; which layer answers depends on match order.
 *              Reported, not failed - it is a routing decision.
 *
 * TWO ROUTE FAMILIES ARE EXCLUDED, and both would otherwise drown the output:
 *   - the routes that SERVE pSEO pages (/:seg1/:seg2 and friends) match every
 *     generated slug by design. Detected by the component they render, so
 *     adding a sixth pSEO route does not silently reintroduce the noise.
 *   - the catch-all path="*" renders NotFound and matches whatever nothing else
 *     claimed. That is the fallback, and it is what makes an unclaimed pSEO
 *     slug resolve at all.
 *
 * OFFLINE. It reads scripts/pseo-slugs.txt, so CI needs no credentials. Refresh
 * that file when the published set changes:
 *   psql "$SUPABASE_DB_URL" -Atc \
 *     "select slug from public.pseo_pages where is_published order by slug" \
 *     > scripts/pseo-slugs.txt
 * A stale list under-reports, which is why the count is printed every run.
 *
 * Usage: node scripts/check-pseo-route-collisions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src/App.tsx');
const REDIRECTS = join(ROOT, 'public/_redirects');
const SLUGS = join(ROOT, 'scripts/pseo-slugs.txt');
const BASELINE = join(ROOT, 'pseo-collision-baseline.json');

if (!existsSync(SLUGS)) {
  console.log(
    '[pseo-collisions] scripts/pseo-slugs.txt not present; nothing to compare. ' +
      'See the header for how to refresh it.'
  );
  process.exit(0);
}

const slugs = readFileSync(SLUGS, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.startsWith('/'));

if (!existsSync(APP)) {
  console.error('[pseo-collisions] src/App.tsx not found - refusing to pass.');
  process.exit(1);
}

const app = readFileSync(APP, 'utf8');

const PSEO_ELEMENT = /Pseo/;
const allRoutes = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)].map((m) => ({
  path: m[1],
  element: m[2],
}));

if (allRoutes.length === 0) {
  console.error('[pseo-collisions] No <Route path="..." element={<X> found in src/App.tsx. The check is blind.');
  process.exit(1);
}

const pseoRoutes = allRoutes.filter((r) => PSEO_ELEMENT.test(r.element));
if (pseoRoutes.length === 0) {
  console.error(
    '[pseo-collisions] No pSEO-serving route found in src/App.tsx. Either the component was ' +
      'renamed or pSEO routing moved; without excluding those routes every slug reports as a hit.'
  );
  process.exit(1);
}

const routePaths = allRoutes
  .filter((r) => !PSEO_ELEMENT.test(r.element))
  .map((r) => r.path)
  .filter((p) => p !== '*' && p !== '/*');

const redirectSources = existsSync(REDIRECTS)
  ? readFileSync(REDIRECTS, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(/\s+/)[0])
  : [];

function routeMatcher(path) {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const hasParam = normalised.includes(':') || normalised.includes('*');
  const re = new RegExp(
    '^' +
      normalised
        .split('/')
        .map((seg) =>
          seg.startsWith(':') ? '[^/]+' : seg === '*' ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('/') +
      '$'
  );
  return { path: normalised, hasParam, re };
}

const matchers = routePaths.map(routeMatcher);

const exact = [];
const shadowed = [];
const redirected = [];

for (const slug of slugs) {
  if (redirectSources.includes(slug)) {
    redirected.push(slug);
    continue;
  }
  // Literal routes are checked first: a slug that matches both a literal and a
  // parameterised route is an exact collision, not a shadowing.
  const literal = matchers.find((m) => !m.hasParam && m.re.test(slug));
  if (literal) {
    exact.push(`${slug}  <-  ${literal.path}`);
    continue;
  }
  const param = matchers.find((m) => m.hasParam && m.re.test(slug));
  if (param) shadowed.push({ slug, route: param.path });
}

console.log(
  `[pseo-collisions] ${slugs.length} published slug(s) vs ${routePaths.length} hand-built route(s) ` +
    `(${pseoRoutes.length} pSEO-serving and 1 catch-all excluded), ${redirectSources.length} redirect source(s).`
);
if (redirected.length > 0) {
  console.log(`[pseo-collisions] ${redirected.length} already handled by public/_redirects.`);
}

if (shadowed.length > 0) {
  // Grouped by route. Seventy lines of slugs is not a finding; "70 pages sit
  // under three entity-detail routes" is.
  const byRoute = new Map();
  for (const { slug, route } of shadowed) {
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(slug);
  }
  console.log(`\n${shadowed.length} published slug(s) sit under a PARAMETERISED route:`);
  for (const [route, list] of [...byRoute].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${route.padEnd(24)} ${String(list.length).padStart(3)}   e.g. ${list.slice(0, 3).join(', ')}`);
  }
  console.log(
    '\n  A routing decision rather than an automatic defect, but not a benign one: an\n' +
      '  entity-detail route will try to resolve the slug as an entity and answer with\n' +
      '  whatever it does for a miss. Decide per prefix which layer owns the slug.'
  );
}

// A RATCHET, not a gate, and for the same reason as every other baseline in
// this repo: the collisions that exist today each need a decision (301 to the
// hand-built page, or unpublish), and that decision is the owner's. Failing CI
// on them would only teach people to ignore this check. Failing on a NEW one is
// the thing worth stopping.
const exactSlugs = exact.map((e) => e.split('  <-  ')[0]).sort();

if (process.argv.includes('--update')) {
  const payload = {
    $comment:
      'WEB-SEO-013 AC7. Published pSEO slugs that collide exactly with a hand-built route. ' +
      'This list must only ever SHRINK - each entry is two pages competing for one query. ' +
      'Re-baseline with: node scripts/check-pseo-route-collisions.mjs --update',
    collisions: exactSlugs,
  };
  writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n[pseo-collisions] baseline written: ${exactSlugs.length} known collision(s).`);
  process.exit(0);
}

const known = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).collisions ?? [] : [];
const fresh = exactSlugs.filter((s) => !known.includes(s));
const cleared = known.filter((s) => !exactSlugs.includes(s));

if (exactSlugs.length > 0) {
  console.log(`\n${exactSlugs.length} slug(s) collide EXACTLY with a hand-built route:`);
  for (const s of exact) console.log(`  ${s}`);
  console.log(
    '\n  Each needs a decision: 301 the generated page to the hand-built one, as\n' +
      '  public/_redirects already does for /things-to-do/tourists, or unpublish it.'
  );
}
if (cleared.length > 0) {
  console.log(`\n${cleared.length} baselined collision(s) are gone. Re-baseline to lock it in.`);
}

if (fresh.length > 0) {
  console.error(`\nX ${fresh.length} NEW exact collision(s), not in the baseline:`);
  for (const s of fresh) console.error(`  ${s}`);
  console.error(
    '\n  Two pages competing for one query is the doorway-page shape WEB-SEO-013 exists to\n' +
      '  avoid. Either give the slug a redirect, or do not publish the generated page.\n'
  );
  process.exit(1);
}

console.log('\nOK No new pSEO/route collisions.');
