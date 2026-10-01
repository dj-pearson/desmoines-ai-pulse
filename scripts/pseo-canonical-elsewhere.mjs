/**
 * SEO-066: which canonical the strict prerender gate expects for a route.
 *
 * Two sources declare that a prerendered page canonicals another page:
 *
 *   - CANONICAL_ELSEWHERE in scripts/prerender-routes.mjs, hand-kept, for hub
 *     routes (/events/near-me -> /events/today, SEO-036);
 *   - scripts/.generated/pseo-canonical-elsewhere.json, written per build by
 *     scripts/generate-dynamic-sitemaps.ts from the pseo_pages rows whose
 *     seo.canonicalUrl names another page (SEO-064: 26 restaurant x time
 *     duplicates such as /bbq/today -> /restaurants).
 *
 * SEO-064 wrote the second file and taught check-prerender-head.mjs to read it,
 * but prerender.mjs only passed the first to strictGateFailures, so every one of
 * the 26 pages was rejected for "canonical points at /restaurants, not
 * /bbq/today" and the unbudgeted pSEO pass failed the whole build. Both readers
 * now go through this module so they cannot disagree again.
 *
 * A declaration only widens the gate for the target it names. The homepage is
 * never accepted as a declared target: a pSEO page canonicalising "/" is the
 * SEO-029 failure (the SPA fallback's head), not a decision anyone made, so a
 * row that stores it is dropped here and the gate keeps rejecting the page.
 */
import fs from 'node:fs';
import { CANONICAL_ELSEWHERE } from './prerender-routes.mjs';

export const PSEO_CANONICAL_ELSEWHERE_FILE = 'scripts/.generated/pseo-canonical-elsewhere.json';

const SITE_PATH = /^(\/[a-z0-9-]+)+$/;

/**
 * Keep only route -> target pairs the gate may honour: both site paths, the
 * target neither the homepage nor the route itself.
 *
 * @param {unknown} routes  the `routes` object from the generated file
 * @returns {{ accepted: Record<string, string>, rejected: string[] }}
 */
export function validatePseoCanonicalElsewhere(routes) {
  const accepted = {};
  const rejected = [];
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return { accepted, rejected };
  for (const [route, target] of Object.entries(routes)) {
    if (typeof target !== 'string' || !SITE_PATH.test(route) || !SITE_PATH.test(target) || target === route) {
      rejected.push(`${route} -> ${JSON.stringify(target)}`);
      continue;
    }
    accepted[route] = target;
  }
  return { accepted, rejected };
}

/**
 * Read the generated file. Absent means the sitemap step could not measure the
 * pSEO rows; the result is then empty and any page that canonicals elsewhere
 * fails the gate, which is the safe direction.
 *
 * @param {(msg: string) => void} [warn]
 * @param {string} [file]
 * @returns {Record<string, string>}
 */
export function readPseoCanonicalElsewhere(warn = console.warn, file = PSEO_CANONICAL_ELSEWHERE_FILE) {
  if (!fs.existsSync(file)) return {};
  let routes;
  try {
    routes = JSON.parse(fs.readFileSync(file, 'utf8'))?.routes;
  } catch (err) {
    warn(`could not read ${file} (${err.message}); pSEO pages that canonical elsewhere will fail the strict gate`);
    return {};
  }
  const { accepted, rejected } = validatePseoCanonicalElsewhere(routes);
  if (rejected.length > 0) {
    warn(`${file}: ignoring ${rejected.length} declaration(s) the gate will not honour: ${rejected.join(', ')}`);
  }
  return accepted;
}

/**
 * The canonical path strictGateFailures should require for `route`. The
 * hand-kept list wins over the generated one.
 *
 * @param {string} route
 * @param {Record<string, string>} pseoCanonicalElsewhere
 * @param {Record<string, string>} [staticCanonicalElsewhere]
 */
export function expectedCanonicalFor(route, pseoCanonicalElsewhere, staticCanonicalElsewhere = CANONICAL_ELSEWHERE) {
  return staticCanonicalElsewhere[route] ?? pseoCanonicalElsewhere[route] ?? route;
}
