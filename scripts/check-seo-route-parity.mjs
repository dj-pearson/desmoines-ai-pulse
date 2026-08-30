/**
 * WEB-SEO-005 guard: keep the prerender route list and public/sitemap-static.xml
 * in agreement.
 *
 * These are two hand-maintained expressions of "the static routes we want
 * indexed", and they silently drifted for months. The consequence was not
 * cosmetic: /events/this-weekend and /things-to-do — the two pages that map to
 * our primary commercial queries — were submitted to search engines but never
 * rendered to static HTML, so every AI crawler robots.txt invites received an
 * empty JavaScript shell for them.
 *
 * Enforced direction (hard failure):
 *   PRERENDER_ROUTES ⊆ sitemap-static.xml
 *   Prerendering a route we do not submit is wasted build time, and if we do
 *   not want it indexed it should not be rendered for crawlers either.
 *
 * Reported direction (hard failure unless declared):
 *   sitemap-static.xml ⊆ PRERENDER_ROUTES ∪ SITEMAP_ONLY_ROUTES
 *   A sitemapped route that is neither prerendered nor declared as a
 *   deliberate exception is exactly the WEB-SEO-005 bug recurring.
 *
 * Run by `npm run validate`. This script is allowed to fail the build —
 * scripts/prerender.mjs deliberately never is, which is why the check lives
 * here instead of there.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  PRERENDER_ROUTES,
  SITEMAP_ONLY_ROUTES,
  DELIBERATELY_EXCLUDED_ROUTES,
} from './prerender-routes.mjs';

const SITEMAP = path.resolve('public/sitemap-static.xml');

function fail(lines) {
  console.error('\n❌ SEO route parity check failed (WEB-SEO-005)\n');
  for (const line of lines) console.error(line);
  console.error(
    '\nFix by editing scripts/prerender-routes.mjs and/or public/sitemap-static.xml',
  );
  console.error('so the two agree. Declare intentional exceptions in SITEMAP_ONLY_ROUTES.\n');
  process.exit(1);
}

function main() {
  if (!fs.existsSync(SITEMAP)) {
    fail([`  public/sitemap-static.xml not found at ${SITEMAP}`]);
  }

  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  if (locs.length === 0) {
    fail(['  public/sitemap-static.xml contains no <loc> entries']);
  }

  // Normalise to pathnames so a base-URL change cannot break the comparison.
  const sitemapPaths = new Set(
    locs.map((loc) => {
      let p;
      try {
        p = new URL(loc).pathname;
      } catch {
        p = loc;
      }
      // Treat "/events" and "/events/" as the same route; keep bare "/" intact.
      return p.length > 1 ? p.replace(/\/+$/, '') : p;
    }),
  );

  const prerender = new Set(PRERENDER_ROUTES);
  const sitemapOnly = new Set(SITEMAP_ONLY_ROUTES);
  const excluded = new Set(DELIBERATELY_EXCLUDED_ROUTES);
  const errors = [];

  // 1. Everything we prerender must be submitted.
  const prerenderedNotSubmitted = PRERENDER_ROUTES.filter((r) => !sitemapPaths.has(r));
  if (prerenderedNotSubmitted.length) {
    errors.push(
      `  Prerendered but NOT in sitemap-static.xml (${prerenderedNotSubmitted.length}):`,
      ...prerenderedNotSubmitted.map((r) => `    ${r}`),
      '    → add them to the sitemap, or drop them from PRERENDER_ROUTES.',
      '',
    );
  }

  // 2. Everything we submit must be prerendered or declared as an exception.
  const submittedNotHandled = [...sitemapPaths].filter(
    (r) => !prerender.has(r) && !sitemapOnly.has(r),
  );
  if (submittedNotHandled.length) {
    errors.push(
      `  In sitemap-static.xml but neither prerendered nor declared (${submittedNotHandled.length}):`,
      ...submittedNotHandled.map((r) => `    ${r}`),
      '    → add to PRERENDER_ROUTES (preferred), or to SITEMAP_ONLY_ROUTES with a reason.',
      '',
    );
  }

  // 3. A route cannot be both excluded and used. Catches half-finished reverts.
  const contradictory = [...excluded].filter((r) => prerender.has(r) || sitemapPaths.has(r));
  if (contradictory.length) {
    errors.push(
      `  Listed in DELIBERATELY_EXCLUDED_ROUTES yet still prerendered or sitemapped (${contradictory.length}):`,
      ...contradictory.map((r) => `    ${r}`),
      '    → remove it from one list or the other; right now the intent is ambiguous.',
      '',
    );
  }

  // 4. A declared sitemap-only route that is not actually in the sitemap is
  //    stale bookkeeping — harmless, but it rots the exception list.
  const staleExceptions = SITEMAP_ONLY_ROUTES.filter((r) => !sitemapPaths.has(r));
  if (staleExceptions.length) {
    errors.push(
      `  Declared in SITEMAP_ONLY_ROUTES but absent from the sitemap (${staleExceptions.length}):`,
      ...staleExceptions.map((r) => `    ${r}`),
      '    → remove the stale declaration.',
      '',
    );
  }

  if (errors.length) fail(errors);

  console.log(
    `✅ SEO route parity: ${PRERENDER_ROUTES.length} prerendered, ` +
      `${SITEMAP_ONLY_ROUTES.length} sitemap-only, ${sitemapPaths.size} sitemapped — consistent.`,
  );
}

main();
