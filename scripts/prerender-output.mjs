/**
 * Where a prerendered route is written in dist/, and how to read it back.
 *
 * SEO-021: this module exists because the output SHAPE is a live SEO signal,
 * not a build-internal detail, and it was previously implied by one path.join
 * in scripts/prerender.mjs with six readers each re-deriving it.
 *
 * THE DIRECTION, and why it is this one.
 *
 * Cloudflare Pages normalizes a request against the file it finds:
 *
 *   dist/events/index.html  ->  GET /events   308 Location: /events/   (slashed wins)
 *   dist/events.html        ->  GET /events/  308 Location: /events    (unslashed wins)
 *
 * Every canonical tag the app renders and every <loc> in the sitemaps declares
 * the UNSLASHED form. Writing directory-style output therefore told Googlebot
 * "the canonical is /restaurants" and then 308'd it when it fetched exactly
 * that - measured on production 2026-08-31 across /restaurants, /events,
 * /things-to-do, /attractions and /playgrounds, the five highest-impression
 * pages on the site.
 *
 * So: flat <route>.html, and the canonicals stay as they are. The other
 * direction (keep directory output, rewrite every canonical and both sitemap
 * generators to the slashed form) reaches the same consistency by moving far
 * more surface, including URLs that are already indexed.
 *
 * DO NOT pair this with the trailing-slash 301 in functions/_middleware.ts.
 * That redirect is deliberately disabled - see the block above
 * trailingSlashRedirect. Pages' 308 /events/ -> /events and a middleware 301
 * /events/ -> /events cannot both fire, but re-enabling it under directory
 * output produced ERR_TOO_MANY_REDIRECTS sitewide on 2026-08-29. With flat
 * output Pages already issues the redirect this direction wants, so the
 * middleware rule is redundant rather than merely dormant.
 *
 * scripts/check-canonical-url-shape.mjs asserts all three signals agree.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Absolute path of the file a route is prerendered to.
 *
 * "/" keeps index.html: it is the SPA shell Pages falls back to for every
 * unprerendered route, so it cannot move.
 */
export function prerenderOutputPath(dist, route) {
  if (route === '/') return path.join(dist, 'index.html');
  const clean = route.replace(/\/+$/, '');
  return path.join(dist, `${clean}.html`);
}

/**
 * The route a prerendered file serves, or null if the file is not one.
 *
 * Inverse of prerenderOutputPath, including the "/" special case.
 */
export function prerenderRouteFromPath(dist, file) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  if (!rel.endsWith('.html')) return null;
  if (rel === 'index.html') return '/';
  return `/${rel.slice(0, -'.html'.length)}`;
}

/**
 * HTML copied verbatim from public/ - dist-relative, posix-separated.
 *
 * These are files, not routes: public/offline.html is the service worker's
 * offline card and public/logo-preview.html is a design scratch page. Before
 * the flat-output switch a walker could say `name === 'index.html'` and never
 * see them; now "every .html under dist/" would sweep both in and report the
 * offline card as a route missing its canonical. Derived from the directory
 * rather than hardcoded so adding a static page does not silently break a gate.
 */
export function staticHtmlPassthroughs(publicDir = 'public') {
  const out = new Set();
  if (!fs.existsSync(publicDir)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        out.add(path.relative(publicDir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(publicDir);
  return out;
}

/**
 * Every prerendered page in dist/, as { file, route }.
 *
 * Skips dist/assets/ and anything staticHtmlPassthroughs names.
 */
export function walkPrerenderedPages(dist, publicDir = 'public') {
  const skip = staticHtmlPassthroughs(publicDir);
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'assets') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const rel = path.relative(dist, full).split(path.sep).join('/');
      if (skip.has(rel)) continue;
      const route = prerenderRouteFromPath(dist, full);
      if (route) out.push({ file: full, route });
    }
  };
  walk(dist);
  return out;
}
