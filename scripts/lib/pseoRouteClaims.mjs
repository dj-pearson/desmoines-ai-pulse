/**
 * WEB-SEO-013 AC7 - which pSEO slugs another route already claims.
 *
 * pseo_pages rows are DATA. Nothing in this repo compares a database row to
 * src/App.tsx, so a collision type-checks, builds, prerenders and deploys.
 *
 * A CLAIMED SLUG DOES NOT RENDER THE pSEO PAGE AT ALL. React Router ranks a
 * static segment above a dynamic one, so /restaurants/asian matches
 * /restaurants/:slug (RestaurantDetails, which then looks for a restaurant
 * called "asian" and finds none) rather than the pSEO catch-all /:seg1/:seg2.
 * That matters beyond the audit: measuring a page's listing by replaying the
 * pSEO component's query says nothing about a URL the pSEO component never
 * renders, so a claimed slug in a sitemap is a submitted soft-404.
 *
 * Two route families are excluded or the output is useless. The routes that
 * SERVE pSEO pages match every generated slug by design - detected by the
 * component they render rather than by hardcoded paths, so a sixth pSEO route
 * does not silently reintroduce hundreds of lines of noise. And path="*"
 * renders NotFound and matches whatever nothing else claimed; that is the
 * fallback, and it is what makes an unclaimed pSEO slug resolve at all.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PSEO_ELEMENT = /Pseo/;

/**
 * SEO-065. /restaurants/<area> is answered by RestaurantDetails, which falls
 * back to the pSEO page when no restaurant has the slug and the slug is in
 * src/pseo/restaurantAreaSlugs.ts. So that route does render the pSEO page
 * for those slugs, and they are not claimed. Read as text because this file is
 * plain JS; the list is a literal there for exactly this reader.
 */
const AREA_SLUGS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'pseo', 'restaurantAreaSlugs.ts');
const AREA_FALLBACK_ROUTE = '/restaurants/:slug';

export function readRestaurantAreaSlugs(path = AREA_SLUGS_FILE) {
  if (!existsSync(path)) throw new Error(`${path} not found - cannot tell which /restaurants/<area> slugs fall back to pSEO.`);
  const block = /RESTAURANT_AREA_SLUGS[^=]*=\s*\[([\s\S]*?)\]/.exec(readFileSync(path, 'utf8'))?.[1] ?? '';
  const slugs = [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  if (slugs.length === 0) throw new Error(`No RESTAURANT_AREA_SLUGS read from ${path}. The check is blind.`);
  return slugs;
}

/**
 * Parses <Route path=... element={<X> pairs out of src/App.tsx.
 * Throws rather than returning an empty result: a regex that stops matching
 * would otherwise report zero collisions, which reads exactly like success.
 */
export function readRoutes(appPath) {
  if (!existsSync(appPath)) {
    throw new Error(`${appPath} not found - refusing to report on routes that were not read.`);
  }
  const app = readFileSync(appPath, 'utf8');
  const allRoutes = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)].map((m) => ({
    path: m[1],
    element: m[2],
  }));

  if (allRoutes.length === 0) {
    throw new Error('No <Route path="..." element={<X> found in src/App.tsx. The check is blind.');
  }
  if (!allRoutes.some((r) => PSEO_ELEMENT.test(r.element))) {
    throw new Error(
      'No pSEO-serving route found in src/App.tsx. Either the component was renamed or pSEO ' +
        'routing moved; without excluding those routes every slug reports as a hit.',
    );
  }
  return allRoutes;
}

export function readRedirectSources(redirectsPath) {
  if (!existsSync(redirectsPath)) return [];
  return readFileSync(redirectsPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]);
}

export function routeMatcher(path) {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const hasParam = normalised.includes(':') || normalised.includes('*');
  const re = new RegExp(
    '^' +
      normalised
        .split('/')
        .map((seg) =>
          seg.startsWith(':') ? '[^/]+' : seg === '*' ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/') +
      '$',
  );
  return { path: normalised, hasParam, re };
}

/**
 * Classifies each slug against the hand-built routes.
 *
 *   exact       a non-parameterised route answers this URL
 *   shadowed    a parameterised route (an entity detail page) answers it
 *   redirected  public/_redirects already sends it somewhere
 *   fallback    /restaurants/<area>: the detail route renders the pSEO page
 *               when no restaurant has that slug (SEO-065)
 *
 * `claimed` is the union of exact and shadowed: the URLs where the pSEO page is
 * not what a visitor gets. Redirected slugs are NOT claimed - the redirect is
 * the resolution, and re-reporting it is what turns a check into noise.
 */
export function classifySlugs(slugs, { appPath, redirectsPath, areaSlugsPath = AREA_SLUGS_FILE }) {
  const allRoutes = readRoutes(appPath);
  const redirectSources = readRedirectSources(redirectsPath);
  const areaSlugs = new Set(readRestaurantAreaSlugs(areaSlugsPath));
  const areaFallback = (slug, route) => {
    if (route !== AREA_FALLBACK_ROUTE) return false;
    const segs = slug.split('/').filter(Boolean);
    return segs.length === 2 && areaSlugs.has(segs[1]);
  };

  const matchers = allRoutes
    .filter((r) => !PSEO_ELEMENT.test(r.element))
    .map((r) => r.path)
    .filter((p) => p !== '*' && p !== '/*')
    .map(routeMatcher);

  const exact = [];
  const shadowed = [];
  const redirected = [];
  // SEO-065: answered by the detail route's pSEO fallback, so not claimed.
  const fallback = [];

  for (const slug of slugs) {
    if (redirectSources.includes(slug)) {
      redirected.push(slug);
      continue;
    }
    // Literal routes are checked first: a slug that matches both a literal and a
    // parameterised route is an exact collision, not a shadowing. Order of
    // declaration in App.tsx must not decide which bucket it lands in, because
    // the AC7 baseline is keyed on the exact set.
    const literal = matchers.find((m) => !m.hasParam && m.re.test(slug));
    if (literal) {
      exact.push({ slug, route: literal.path });
      continue;
    }
    const param = matchers.find((m) => m.hasParam && m.re.test(slug));
    if (param && areaFallback(slug, param.path)) {
      fallback.push({ slug, route: param.path });
      continue;
    }
    if (param) shadowed.push({ slug, route: param.path });
  }

  return {
    allRoutes,
    pseoRouteCount: allRoutes.filter((r) => PSEO_ELEMENT.test(r.element)).length,
    routeCount: matchers.length,
    redirectSources,
    exact,
    shadowed,
    redirected,
    fallback,
    claimed: new Set([...exact.map((e) => e.slug), ...shadowed.map((s) => s.slug)]),
  };
}
