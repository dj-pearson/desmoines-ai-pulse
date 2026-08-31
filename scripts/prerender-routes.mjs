/**
 * Single source of truth for the public routes we prerender (WEB-SEO-005).
 *
 * This used to live inline in scripts/prerender.mjs while public/sitemap-static.xml
 * kept a second, hand-maintained copy of the same intent. The two drifted: eight
 * sitemapped routes were never prerendered — including /events/this-weekend and
 * /things-to-do, the two highest-intent pages on the site — while /pricing,
 * /advertise, /business and /search consumed prerender budget instead.
 *
 * Googlebot renders the SPA, so Google saw those pages anyway. The AI crawlers
 * public/robots.txt explicitly invites (GPTBot, OAI-SearchBot, ChatGPT-User,
 * ClaudeBot, PerplexityBot, Applebot-Extended, YouBot, meta-externalagent) do
 * not execute JavaScript, so for them an omission here means the page has no
 * content at all.
 *
 * scripts/check-seo-route-parity.mjs enforces the invariant below and runs as
 * part of `npm run validate`.
 */

/**
 * Routes rendered to static HTML after `vite build`.
 *
 * INVARIANT: every route here must also appear in public/sitemap-static.xml.
 * Prerendering a page we do not submit for indexing is wasted build time; if a
 * route does not belong in the sitemap, it does not belong here either.
 */
export const PRERENDER_ROUTES = [
  '/',

  // Events — hub, temporal landing pages, and per-suburb pages.
  // The temporal pages are the primary commercial target (WEB-SEO-005).
  '/events',
  '/events/today',
  '/events/this-weekend',
  '/events/free',
  '/events/kids',
  '/events/date-night',
  '/events/west-des-moines',
  '/events/ankeny',
  '/events/urbandale',
  '/events/johnston',
  '/events/altoona',
  '/events/clive',
  '/events/windsor-heights',

  // Restaurants
  '/restaurants',
  '/restaurants/open-now',
  '/restaurants/dietary',

  // Other content hubs
  '/attractions',
  '/playgrounds',
  '/things-to-do',
  // The target of the /things-to-do/tourists 301 (WEB-UX-016). That redirect was
  // added because the generated pSEO page duplicated this hand-built one - so the
  // page that WON the duplication was the one in no sitemap and no prerender
  // list, and a crawler following the 301 landed on a JS-only page nothing
  // declared. Found by cross-checking public/_redirects against the sitemaps.
  '/visitors-guide',
  '/stay',
  '/articles',
  '/guides',
  '/iowa-state-fair',

  // SEO-022. These six routes exist in App.tsx and were in neither this list
  // nor sitemap-static.xml, so they returned the homepage title, the homepage
  // body and zero JSON-LD to every JS-less crawler — measured with
  // `curl -A GPTBot` against production on 2026-08-31, all six identical. This
  // is the same defect SEO-001 fixed for entity pages, left live on six hubs.
  //
  // /outdoors is the one that costs the most: the Keyword Planner join in
  // docs/seo/keyword-research/keyword-opportunities.csv returns volume on 19 of
  // 19 outdoors terms at competition index 1-3.
  '/outdoors',
  '/music',
  '/sports',
  '/breweries',
  '/best-of',
  '/getting-around',

  // Neighborhood guides
  '/neighborhoods',
  '/neighborhoods/downtown',
  '/neighborhoods/east-village',
  '/neighborhoods/beaverdale',
  '/neighborhoods/highland-park',

  // Discovery / planning surfaces
  '/calendar',
  '/deals',
  '/map',
  '/trip-planner',
  '/itineraries',

  '/contact',
];

/**
 * Routes that are legitimately in public/sitemap-static.xml but deliberately
 * not prerendered: we want them indexable, but they carry no organic query
 * worth spending a Chromium render on.
 *
 * This exists so the parity check can distinguish a declared exception from an
 * accidental omission — the failure mode that produced WEB-SEO-005.
 */
export const SITEMAP_ONLY_ROUTES = [
  '/advertise',
  '/business-partnership',
  '/privacy-policy',
  '/terms',
];

/**
 * Routes intentionally excluded from BOTH lists, recorded so the reasoning is
 * not lost and nobody "helpfully" adds them back.
 *
 *   /search   — internal search results are thin content by construction and
 *               are now noindex (WEB-SEO-005).
 *   /pricing  — conversion page, no organic query to win.
 *   /business — conversion page, and it prerendered as a sign-in wall
 *               (WEB-SEO-004).
 *   /weekend  — 301s to /events/this-weekend (WEB-SEO-007).
 */
export const DELIBERATELY_EXCLUDED_ROUTES = [
  '/search',
  '/pricing',
  '/business',
  '/weekend',
];
