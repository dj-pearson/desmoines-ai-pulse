/**
 * Post-build prerender (PROD-SEO-001).
 *
 * The app is a client-rendered SPA, so crawlers historically received an empty
 * shell — the root cause behind the soft-404 / "discovered, not indexed" issues.
 * This step renders the high-value PUBLIC landing/hub routes with headless
 * Chromium after `vite build` and writes real HTML to dist/<route>/index.html.
 * Cloudflare Pages serves those static files to crawlers, while the SPA bundle
 * (still present in the captured HTML) boots and takes over for real users.
 *
 * FAILURE POLICY (WEB-OPS-020): a hub-route shortfall FAILS THE BUILD.
 *
 * This used to end in `.finally(() => process.exit(0))`, on the reasoning that
 * a failed prerender leaves the SPA build intact so "worst case is same as
 * before". That reasoning is wrong now. Prerendering is the mechanism — the
 * only mechanism — by which the JS-less crawlers robots.txt invites see any
 * content at all, and the build output is byte-identical whether it ran or
 * not. So a Chromium launch failure produced a green build, a successful
 * deploy, and a site that silently served empty shells to every AI crawler,
 * with one `[prerender]` warning buried in build logs nobody reads.
 *
 * Measured against production on 2026-08-11: `/` returns 39 data-rh tags and
 * its real canonical, `/restaurants/` 46, `/events/today/` 32 — so Chromium
 * does launch on the Cloudflare Pages build image, and a shortfall there means
 * something actually broke rather than the host being incapable.
 *
 * Fatal: puppeteer missing, Chromium unlaunchable, dist/index.html absent, or
 * fewer hub routes written than PRERENDER_ROUTES contains. Not fatal: the
 * entity pass, which is opt-in, budgeted, and fail-closed by design.
 *
 * TWO PASSES (WEB-SEO-006):
 *   1. Hub routes from PRERENDER_ROUTES — always run, no time budget.
 *   2. Entity detail pages (/events/:slug, /restaurants/:slug, ...) enumerated
 *      from the sitemaps in dist/. Opt-in via PRERENDER_ENTITIES=true, bounded
 *      by PRERENDER_ENTITY_BUDGET_SECONDS, and gated by a strict check that the
 *      page rendered as ITSELF before it is written.
 *
 * Why the entity pass matters: Googlebot renders our SPA, so it already sees
 * these pages. The AI crawlers robots.txt invites — GPTBot, OAI-SearchBot,
 * ChatGPT-User, ClaudeBot, PerplexityBot, Applebot-Extended — execute no
 * JavaScript, and entity pages are exactly what AI assistants cite by name.
 *
 * Why the entity pass is strict: measured on a build with an unreachable
 * database, all 877 entity URLs produced the same ~1,370 characters of promo
 * boilerplate with no title and no canonical of their own. Publishing those
 * would replace a shell Google renders into real content with static, thin,
 * near-duplicate HTML. Fail-closed is the only safe default here.
 *
 * Measured on a 4-core box, placeholder DB credentials:
 *   sequential  2.26 s/route
 *   concurrency 3 (cores-1)  ~0.94 s/route  → 877 entities ≈ 13.7 min
 * Real data will be slower. Cloudflare Pages kills a build at 20 minutes, and
 * `vite build` already costs ~70s, which is what the budget exists to protect.
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { stripInjectedPreloads, restoreAsyncFontLinks } from './lazy-preload-patterns.mjs';
import { PRERENDER_ROUTES } from './prerender-routes.mjs';
import process from 'node:process';

const DIST = path.resolve('dist');

// Curated public, static (non-param, non-auth, non-admin) routes worth indexing.
// Defined in scripts/prerender-routes.mjs so public/sitemap-static.xml can be
// checked against the same list — see WEB-SEO-005 and
// scripts/check-seo-route-parity.mjs.
const ROUTES = PRERENDER_ROUTES;

// Render N pages at once. Chromium pages are CPU-bound here, so leave the host
// a core. Measured on a 4-core box: 2.26s/route sequential, ~0.8s/route at 4.
const CONCURRENCY = Math.max(
  1,
  Number(process.env.PRERENDER_CONCURRENCY) || Math.min(6, Math.max(2, os.cpus().length - 1)),
);

// WEB-SEO-006: prerender entity detail pages (/events/:slug, /restaurants/:slug,
// ...) as well as hubs. Off by default — see the note in collectEntityRoutes().
const PRERENDER_ENTITIES = process.env.PRERENDER_ENTITIES === 'true';

// Hard ceiling on the entity pass. Cloudflare Pages kills a build at 20 minutes,
// and this step runs AFTER vite build (~70s), so the budget has to leave room.
// Going over budget is not an error; it is reported as incomplete coverage.
const ENTITY_BUDGET_SECONDS = Number(process.env.PRERENDER_ENTITY_BUDGET_SECONDS) || 420;

// Entity sitemaps, in priority order. If the budget runs out, later files lose
// out — so this order is a product decision, not an alphabetical accident.
// Events first: they are the freshest, the highest-intent, and the ones AI
// assistants get asked about by name. Guides/articles are evergreen and are the
// least damaged by shipping a day late.
const ENTITY_SITEMAPS = [
  'sitemap-events.xml',
  // WEB-SEO-013: generated pSEO pages are pure SPA routes with no static
  // fallback, so they need prerendering more than most — but they sit after
  // events here because they are evergreen and events are not.
  'sitemap-pseo.xml',
  'sitemap-restaurants.xml',
  'sitemap-attractions.xml',
  'sitemap-playgrounds.xml',
  'sitemap-articles.xml',
  'sitemap-guides.xml',
];

/**
 * Entity URLs to prerender, read from the sitemaps in dist/.
 *
 * Deriving these from the sitemap rather than querying Supabase directly is
 * deliberate:
 *   - the sitemaps are generated immediately before this step by
 *     `npm run generate-sitemaps`, so they are already the canonical, freshly
 *     built list of what we want indexed;
 *   - it keeps prerendered ⊆ sitemapped by construction, which is the invariant
 *     scripts/check-seo-route-parity.mjs enforces for hub routes;
 *   - it needs no service credentials in the prerender step.
 *
 * WHY THIS IS OFF BY DEFAULT: at ~0.8s/route with 4 workers, 884 entity URLs is
 * roughly 12 minutes on top of the vite build. That fits inside Cloudflare's
 * 20-minute limit with little margin, and the measurement was taken with a
 * placeholder Supabase key, so pages resolved without waiting on real queries —
 * a production build will be slower. Enable with PRERENDER_ENTITIES=true once
 * the timing has been confirmed on the real build host, and tune
 * PRERENDER_ENTITY_BUDGET_SECONDS / PRERENDER_CONCURRENCY from there.
 */
function collectEntityRoutes() {
  const seen = new Set();
  const routes = [];
  for (const file of ENTITY_SITEMAPS) {
    const full = path.join(DIST, file);
    if (!fs.existsSync(full)) {
      warn(`${file} not found in dist — skipping its entity URLs`);
      continue;
    }
    let xml;
    try {
      xml = fs.readFileSync(full, 'utf8');
    } catch (e) {
      warn(`could not read ${file} (${e.message}) — skipping`);
      continue;
    }
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      let pathname;
      try {
        pathname = new URL(m[1]).pathname;
      } catch {
        continue;
      }
      // Hub routes are handled by ROUTES; a sitemap listing a hub (the events
      // generator falls back to /events when it finds no rows) must not cause a
      // second render of it.
      if (seen.has(pathname) || ROUTES.includes(pathname)) continue;
      seen.add(pathname);
      routes.push(pathname);
    }
  }
  return routes;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function warn(msg) {
  console.warn(`[prerender] ${msg}`);
}

/**
 * A condition that must fail the build rather than warn. See the failure policy
 * at the top of this file. Thrown, not exited on, so cleanup still runs.
 */
class PrerenderFailure extends Error {}

async function main() {
  if (process.env.PRERENDER === 'false') {
    console.log('[prerender] skipped (PRERENDER=false)');
    return;
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new PrerenderFailure(
      `${indexPath} not found. vite build reported success, so either the output directory ` +
        'moved or the build did not actually emit — nothing downstream of here can be trusted.',
    );
  }

  // Cache the original SPA shell ONCE so per-route writes can't affect the
  // fallback we serve while rendering other routes.
  const indexHtml = fs.readFileSync(indexPath);

  // ...but caching it is only safe if it IS the pristine vite shell. Route '/'
  // writes back to this same file, so a SECOND prerender run against the same
  // dist/ picks up the previously RENDERED homepage and serves that as the SPA
  // fallback for every unresolved path. React then boots on top of a fully
  // rendered DOM, and the resulting hydration mismatch silently breaks Helmet:
  // the body renders fine while <title>, <link rel=canonical> and the JSON-LD
  // blocks stay at whatever the stale file had — with the run still reporting
  // success.
  //
  // Cost me an hour chasing a phantom "concurrency broke Helmet" theory, which
  // a controlled A/B disproved. CI is unaffected because it always builds into
  // a fresh dist/, so this only bites re-runs — which is precisely when it is
  // least expected.
  //
  // The tell used to be `data-rh` anywhere in the file. That stopped working:
  // index.html now authors data-rh onto its own fallback <title>/description/og
  // tags on purpose (WEB-SEO-002/012 — it hands them to Helmet so per-page tags
  // REPLACE rather than duplicate them), so the warning fired on every clean
  // build. A warning that is always wrong is worse than no warning; it is how
  // the real one gets scrolled past.
  //
  // React replaces the entire contents of #root when it renders, so the shell's
  // <noscript> fallback block surviving inside #root is positive proof this file
  // has not been rendered into.
  const rootIndex = indexHtml.toString('utf8').indexOf('<div id="root">');
  const rootHead = rootIndex === -1 ? '' : indexHtml.toString('utf8').slice(rootIndex, rootIndex + 600);
  if (rootIndex !== -1 && !rootHead.includes('<noscript>')) {
    warn(
      'dist/index.html is ALREADY PRERENDERED (the shell noscript fallback is gone from #root). ' +
        'Using it as the SPA ' +
        'fallback can corrupt every route\'s <head> via hydration mismatch. Re-run `vite build` ' +
        'for a clean dist/ before prerendering; results from this run are not trustworthy.',
    );
  }
  // Vite-built HTML, captured before any prerender write. The set of
  // modulepreload links IN here is the ground truth for what should be
  // preloaded; anything the browser adds on top is a lazy chunk.
  const buildHtml = indexHtml.toString("utf8");

  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (e) {
    throw new PrerenderFailure(
      `puppeteer could not be imported (${e.message}). It is a devDependency, so this normally ` +
        'means the build host installed production dependencies only, or the Chromium download ' +
        'was skipped. Prerendering cannot run and the deploy would ship shells to JS-less crawlers.',
    );
  }

  // Static server for dist with SPA fallback to the cached index.html.
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath.replace(/^\/+/, '');
      const filePath = path.join(DIST, rel);
      if (
        rel &&
        filePath.startsWith(DIST) &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    } catch {
      /* fall through to SPA shell */
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
  });

  // Port 0 = let the OS pick a free one, then read it back. This used to be a
  // hard-coded 4178, so a leftover prerender from an interrupted run made the
  // next build die on EADDRINUSE — and, under the old exit-0 policy, ship an
  // SPA-only bundle. Nothing outside this process needs to know the port.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const PORT = server.address().port;

  // ONE BROWSER PER WORKER, not one browser with N tabs (WEB-SEO-002).
  //
  // With N pages open in a single Chromium, only one is the active tab and the
  // rest never get their rAF callbacks serviced. react-helmet-async commits
  // <head> from a rAF, so on the backgrounded tabs it simply never runs: the
  // body renders completely — correct content, correct h1 — while <title>,
  // <link rel=canonical> and every JSON-LD block stay at the build shell's
  // values, and the run reports success.
  //
  // Measured on a pristine dist/, varying only concurrency: at 1 and 2 the
  // homepage shipped its real title and canonical; at 3, 4 and 6 it shipped
  // data-rh=0, no canonical, and the shell title. The heaviest page loses
  // first, which here is the homepage — the single most valuable URL on the
  // site. Separate browser processes each have their own foreground page and
  // fix it outright: data-rh=35 and the correct canonical at concurrency 6.
  //
  // --disable-renderer-backgrounding and friends do NOT help; that was tried
  // and A/B'd on a pristine shell, and made no difference. Do not "simplify"
  // this back to a shared browser.
  //
  // Cost is N Chromium processes instead of one. At the concurrency levels here
  // (2-6) that is a few hundred MB, which is the right trade for output that is
  // actually correct.
  const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  let browsers = [];
  try {
    browsers = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS }),
      ),
    );
  } catch (e) {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
    server.close();
    throw new PrerenderFailure(
      `could not launch Chromium (${e.message}). On a Linux build host this is usually a missing ` +
        'shared library (libnss3, libatk-1.0, libgbm) or a Chromium binary that npm ci did not ' +
        'download. Production does launch it, so treat this as broken rather than unsupported.',
    );
  }

  /** Release the browsers and the static server. Safe to call more than once. */
  const shutdown = async () => {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
    server.close();
  };

  let ok = 0;
  let failed = 0;
  let strippedTotal = 0;
  let restoredFontsTotal = 0;

  // The title vite shipped in the shell. An entity page that still carries this
  // never rendered itself — see the strict gate in renderRoute().
  const shellTitle = /<title>(.*?)<\/title>/is.exec(buildHtml)?.[1]?.trim() ?? null;

  /**
   * Render one route and write dist/<route>/index.html. Throws on failure.
   *
   * `strict` (entity pass) additionally requires positive proof the page
   * rendered as ITSELF rather than as the SPA shell.
   */
  async function renderRoute(route, strict = false, browser = browsers[0]) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Wait for the SPA to render real content into #main-content rather than
      // for network idle — realtime sockets / analytics keep the network busy
      // and never reach networkidle (this is why the home route used to time out).
      //
      // ">40 characters" is not enough on its own. "Loading articles..." plus a
      // heading clears 40 instantly, so this resolved mid-fetch and the capture
      // downstream was a skeleton — which the publish gate then correctly
      // rejected, failing the build. /articles did that on 2 of 4 consecutive
      // clean builds, its render pass finishing in 11s against 20s on the runs
      // that succeeded. The gate was right and this wait was wrong: it has to
      // hold until the page is no longer telling us it is still loading.
      //
      // Same predicate the publish gate uses, so the two cannot disagree: a
      // "Loading <thing>..." marker only counts as still-loading while
      // #main-content is under 2000 characters — below-the-fold widgets on an
      // otherwise complete page must not block the capture.
      await page
        .waitForFunction(
          () => {
            const m = document.getElementById('main-content');
            if (!m) return false;
            const text = (m.textContent || '').trim();
            if (text.length <= 40) return false;
            const stillLoading = /Loading [a-z][a-z ]{2,24}\.\.\./i.test(document.body.innerHTML);
            return !stillLoading || text.length >= 2000;
          },
          { timeout: 20000 },
        )
        .catch(() => {});

      // Then wait for Helmet to have actually committed the <head>, rather than
      // sleeping a fixed 600ms and hoping. react-helmet-async stamps data-rh on
      // every tag it manages, so its presence is a precise "Helmet has run"
      // signal. See the browser-per-worker note at launch for why this matters.
      //
      // A route that renders no SEO component at all emits no data-rh and just
      // hits the timeout, same as the old sleep. Twelve hub routes are in that
      // state today (WEB-SEO-002), so keep the timeout short enough that they
      // do not dominate the run.
      // The old predicate was `!!document.head.querySelector('[data-rh]')`, and
      // it had silently become a no-op: index.html now authors 9 data-rh tags
      // of its own (WEB-SEO-002/012 hands the fallback title/description/og
      // tags to Helmet so per-page values REPLACE rather than duplicate them),
      // so the selector matched before React had even mounted. Every route got
      // the 250ms sleep below and nothing more.
      //
      // MEASURED CONSEQUENCE on a clean build: /events/free, /events/date-night,
      // /events/ankeny and /events/johnston shipped with data-rh=9 — the shell
      // count, i.e. Helmet never committed — no canonical, and the site-wide
      // default description. Their siblings /events/kids, /events/urbandale,
      // /events/altoona and /events/clive, which render the SAME component with
      // the same props, shipped data-rh=30-31 with correct canonicals. Same
      // build, same code: a race, not a missing component. That is the shape
      // WEB-SEO-002 was reading as "12 routes render no SEOHead".
      //
      // Waiting for the count to EXCEED the shell's baseline is a real "Helmet
      // has run" signal. Falling back to the count keeps this honest if a route
      // genuinely renders no SEO component: it times out, exactly as before.
      const shellDataRh = (buildHtml.match(/\sdata-rh[=\s>]/g) || []).length;
      await page
        .waitForFunction(
          (baseline) => document.head.querySelectorAll('[data-rh]').length > baseline,
          { timeout: 8000 },
          shellDataRh,
        )
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 250));

      const captured = await page.content();

      // Chromium ran the app, so Vite's runtime __vitePreload helper injected
      // modulepreload links for every lazy chunk that rendered. Serializing the
      // DOM bakes those into the shipped HTML, turning lazy chunks back into
      // eager first-paint downloads (~440KB gzipped of 3D engine, editor,
      // Recharts and D3 on the homepage). Strip them back out — the build
      // plugin already removed the build-time copies, and this removes the
      // runtime-injected ones. See scripts/lazy-preload-patterns.mjs.
      const [dePreloaded, strippedPreloads] = stripInjectedPreloads(captured, buildHtml);
      // Chromium already fired the font link's onload, flipping rel to
      // "stylesheet" in the live DOM. Serializing that makes the shipped HTML
      // render-block on fonts.googleapis.com. Put it back to preload.
      const [html, restoredFonts] = restoreAsyncFontLinks(dePreloaded);
      if (restoredFonts > 0) restoredFontsTotal += restoredFonts;
      if (strippedPreloads > 0) {
        strippedTotal += strippedPreloads;
      }
      // Sanity: only write if we captured a real document with our root.
      if (!html || !html.includes('<div id="root"')) {
        throw new Error('captured HTML missing #root');
      }

      // Never freeze a transient failure state into static HTML.
      //
      // The prerenderer captures whatever the page happens to be showing. If a
      // data fetch is slow or the database is briefly unreachable during the
      // build, that is a loading skeleton or an error screen — and it gets
      // written to dist/ and served to crawlers as the page's final content.
      // Observed with unreachable credentials: /events captured "Loading events
      // page…" and /articles captured "You're offline".
      //
      // Throwing leaves no file for the route, so Cloudflare serves the SPA
      // shell and Googlebot renders it client-side — exactly the behaviour
      // before the route was prerendered, and strictly better than publishing
      // an error page.
      //
      // TWO CLASSES, TREATED DIFFERENTLY. A hard error means the page failed,
      // full stop. A loading skeleton does NOT: this app lazy-loads plenty of
      // below-the-fold sections, so a fully-rendered page can legitimately
      // still show "Loading dashboard…" in one widget. Rejecting on that alone
      // threw away the homepage — 11k characters of real content — over a
      // single spinner. So skeletons only count when the page is MOSTLY
      // skeleton, measured by how much text #main-content actually has.
      const hardFailure = [
        "You're offline",
        'Check your internet connection',
        'Unable to Load',
        'Something went wrong',
      ].find((marker) => html.includes(marker));

      let loadingFailure = null;
      if (!hardFailure) {
        // Matched by shape rather than by listing each variant — the app renders
        // "Loading <thing>…" a dozen ways and an explicit list only ever catches
        // the ones somebody happened to see.
        const skeleton = /<[^>]*>Loading [a-z][a-z ]{2,24}\.\.\.</i.exec(html)?.[0];
        if (skeleton) {
          const main = /id="main-content"([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
          const textLength = main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
          // Below this, the skeleton IS the page rather than one section of it.
          // Fully-rendered hub pages measure several thousand characters.
          if (textLength < 2000) {
            loadingFailure = `${skeleton.replace(/<[^>]*>/g, '')} (only ${textLength} chars rendered)`;
          }
        }
      }

      const failureMarker = hardFailure ?? loadingFailure;
      if (failureMarker) {
        throw new Error(
          `captured a transient failure/loading state ("${failureMarker}") — refusing to publish it ` +
            `as static HTML; the route keeps its SPA shell`,
        );
      }

      const outDir = route === '/' ? DIST : path.join(DIST, route);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html);
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Run `routes` through `concurrency` parallel workers.
   *
   * `deadline` (epoch ms, or null) stops the pool early. Anything not reached
   * is RETURNED, not silently dropped — the caller logs the shortfall. A
   * prerender step that quietly covers 60% of its input reads as "covered
   * everything" in CI output, which is exactly how you end up believing pages
   * are indexed when they are not.
   */
  async function renderPool(routes, concurrency, deadline, strict = false) {
    const queue = [...routes];
    const unrendered = [];
    const worker = async (browser) => {
      for (;;) {
        if (deadline && Date.now() > deadline) {
          unrendered.push(...queue.splice(0));
          return;
        }
        const route = queue.shift();
        if (route === undefined) return;
        try {
          await renderRoute(route, strict, browser);
          ok++;
        } catch (e) {
          failed++;
          warn(`route ${route} failed: ${e.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(browsers[i % browsers.length])));
    return unrendered;
  }

  const startedAt = Date.now();

  // Hub routes first and without a deadline: they are the highest-value pages
  // and there are only ~35 of them.
  await renderPool(ROUTES, CONCURRENCY, null);
  const hubSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[prerender] hubs: ${ok} prerendered, ${failed} skipped, of ${ROUTES.length} routes in ${hubSeconds}s (concurrency ${CONCURRENCY})`,
  );

  // The whole point of WEB-OPS-020: 1 of 35 must not look like 35 of 35. Every
  // hub route is in sitemap-static.xml (check-seo-route-parity.mjs enforces
  // that), so a missing one is a URL we told search engines to crawl and then
  // served an empty shell.
  // Assert against the artifact on disk, not against `ok`. A counter can be
  // incremented by a render that wrote somewhere unexpected; dist/<route>/
  // index.html is what Cloudflare actually serves.
  const missingOnDisk = ROUTES.filter(
    (route) => !fs.existsSync(path.join(route === '/' ? DIST : path.join(DIST, route), 'index.html')),
  );
  if (ok < ROUTES.length || missingOnDisk.length > 0) {
    await shutdown();
    throw new PrerenderFailure(
      `hub prerender incomplete: ${ok}/${ROUTES.length} routes rendered (${failed} failed), ` +
        `${missingOnDisk.length} missing from dist/${missingOnDisk.length ? `: ${missingOnDisk.join(', ')}` : ''}. ` +
        'Per-route reasons are in the [prerender] warnings above.',
    );
  }
  console.log(`[prerender] hub coverage verified on disk: ${ROUTES.length}/${ROUTES.length}`);

  // WEB-SEO-006: entity detail pages.
  let entityUnrendered = [];
  let entityTotal = 0;
  if (PRERENDER_ENTITIES) {
    const entityRoutes = collectEntityRoutes();
    entityTotal = entityRoutes.length;
    if (entityTotal === 0) {
      warn('entity prerender enabled but no entity URLs found in the sitemaps — skipping');
    } else {
      const budgetMs = ENTITY_BUDGET_SECONDS * 1000;
      console.log(
        `[prerender] entities: ${entityTotal} URLs from sitemaps, budget ${ENTITY_BUDGET_SECONDS}s`,
      );
      const before = ok;
      entityUnrendered = await renderPool(entityRoutes, CONCURRENCY, Date.now() + budgetMs, true);
      console.log(
        `[prerender] entities: ${ok - before} prerendered, ${entityUnrendered.length} left unrendered (budget)`,
      );
      if (entityUnrendered.length > 0) {
        // Loud on purpose. See renderPool's docstring.
        warn(
          `ENTITY COVERAGE INCOMPLETE: ${entityUnrendered.length}/${entityTotal} entity URLs were not prerendered ` +
            `within the ${ENTITY_BUDGET_SECONDS}s budget. Those URLs are in the sitemap but ship as an SPA shell, ` +
            `so JS-less crawlers (GPTBot, PerplexityBot, ClaudeBot, OAI-SearchBot) see nothing on them. ` +
            `Raise PRERENDER_ENTITY_BUDGET_SECONDS or PRERENDER_CONCURRENCY, minding the host's build timeout.`,
        );
      }
    }
  }

  await shutdown();
  const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
  const scope = PRERENDER_ENTITIES ? `${ROUTES.length} hub + ${entityTotal} entity` : `${ROUTES.length} hub`;
  console.log(
    `[prerender] done in ${totalSeconds}s: ${ok} prerendered, ${failed} failed, ` +
      `${entityUnrendered.length} over budget, of ${scope} routes; ` +
      `stripped ${strippedTotal} runtime-injected modulepreload link(s); ` +
      `restored ${restoredFontsTotal} async font link(s)`,
  );

  // WEB-OPS-020 AC5. The counts only ever existed in the raw build log, which
  // is where a drop from 35 to 1 went unnoticed for weeks. The step summary is
  // on the run's front page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const entityLine = PRERENDER_ENTITIES
      ? `\n- Entity routes: ${entityTotal - entityUnrendered.length}/${entityTotal} (${entityUnrendered.length} over the ${ENTITY_BUDGET_SECONDS}s budget)`
      : '\n- Entity routes: not run (PRERENDER_ENTITIES unset)';
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Prerender\n- Hub routes: **${ROUTES.length}/${ROUTES.length}** written to dist/${entityLine}\n- Wall clock: ${totalSeconds}s at concurrency ${CONCURRENCY}\n`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // ::error:: so the reason lands in the GitHub Actions run summary instead of
    // only in the build log, where the old warning went to die.
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::error title=Prerender failed::${e.message.replace(/\r?\n/g, ' ')}`);
    }
    console.error(`[prerender] FAILED: ${e.message}`);
    if (!(e instanceof PrerenderFailure) && e.stack) console.error(e.stack);
    process.exit(1);
  });
