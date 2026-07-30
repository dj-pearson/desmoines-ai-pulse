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
 * SAFETY: this NEVER fails the build. Any error (Chromium unavailable on the
 * build host, a route timing out, etc.) is logged and we exit 0, leaving the
 * normal SPA build in place — i.e. worst case is "same as before".
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
const PORT = 4178;

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

async function main() {
  if (process.env.PRERENDER === 'false') {
    console.log('[prerender] skipped (PRERENDER=false)');
    return;
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    warn('dist/index.html not found — skipping prerender');
    return;
  }

  // Cache the original SPA shell ONCE so per-route writes can't affect the
  // fallback we serve while rendering other routes.
  const indexHtml = fs.readFileSync(indexPath);
  // Vite-built HTML, captured before any prerender write. The set of
  // modulepreload links IN here is the ground truth for what should be
  // preloaded; anything the browser adds on top is a lazy chunk.
  const buildHtml = indexHtml.toString("utf8");

  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (e) {
    warn(`puppeteer not available (${e.message}) — skipping prerender`);
    return;
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

  await new Promise((resolve) => server.listen(PORT, resolve));

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (e) {
    warn(`could not launch Chromium (${e.message}) — skipping prerender`);
    server.close();
    return;
  }

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
  async function renderRoute(route, strict = false) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Wait for the SPA to render real content into #main-content rather than
      // for network idle — realtime sockets / analytics keep the network busy
      // and never reach networkidle (this is why the home route used to time out).
      await page
        .waitForFunction(
          () => {
            const m = document.getElementById('main-content');
            return !!m && (m.textContent || '').trim().length > 40;
          },
          { timeout: 15000 },
        )
        .catch(() => {});
      // Let Helmet flush the <head> and any remaining render settle.
      await new Promise((r) => setTimeout(r, 600));

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

      // WEB-SEO-006 quality gate: refuse to write a page that self-identifies as
      // a DIFFERENT url.
      //
      // The dev server falls back to the SPA shell for any path it has no file
      // for, and if the app fails to resolve a route — no data, a redirect to
      // home, a slug that no longer exists — what gets captured can be the
      // homepage wearing the entity's URL, canonical tag and all. Writing that
      // would publish hundreds of near-identical pages each canonicalised to
      // "/", which is materially worse than leaving them as an SPA shell:
      // mass duplicate content plus a canonical pointing away from the URL.
      //
      // Observed for real while measuring this pass, so the gate is not
      // hypothetical. Failing the route is correct — it leaves the existing SPA
      // shell in place and reports the miss.
      const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(html)?.[1];
      if (canonical) {
        let canonicalPath = null;
        try {
          canonicalPath = new URL(canonical, 'https://desmoinesinsider.com').pathname;
        } catch {
          /* unparseable canonical — fall through to the mismatch check below */
        }
        const normalise = (p) => (p && p.length > 1 ? p.replace(/\/+$/, '') : p);
        if (normalise(canonicalPath) !== normalise(route)) {
          throw new Error(
            `canonical mismatch: page declares "${canonicalPath}" but was rendered for "${route}" ` +
              `(likely an unresolved route falling back to the SPA shell)`,
          );
        }
      }

      // Strict gate for the entity pass: require POSITIVE evidence the page
      // rendered as itself. The canonical check above only fires when a
      // canonical exists — an entity page that never resolved its data emits no
      // canonical at all, so it sails through. Measured here: with an
      // unreachable database, 127 event URLs each produced the same 1,370
      // characters of promo boilerplate, no title of their own, no canonical.
      //
      // Publishing those is strictly worse than doing nothing. Today those URLs
      // ship an SPA shell that Googlebot renders client-side into real content;
      // replacing it with static near-duplicate HTML gives Google a reason not
      // to re-render, and hands it hundreds of thin duplicates. So the entity
      // pass fails closed: no proof, no write, and the URL keeps the shell.
      if (strict) {
        if (!canonical) {
          throw new Error(
            'no canonical in rendered output — entity page did not resolve (data fetch failed, ' +
              'or the slug no longer exists). Refusing to publish an SPA shell as a static page.',
          );
        }
        const title = /<title>(.*?)<\/title>/is.exec(html)?.[1]?.trim();
        if (!title || (shellTitle && title === shellTitle)) {
          throw new Error(
            `title is still the build shell's ("${shellTitle}") — entity page did not render itself`,
          );
        }
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
    const worker = async () => {
      for (;;) {
        if (deadline && Date.now() > deadline) {
          unrendered.push(...queue.splice(0));
          return;
        }
        const route = queue.shift();
        if (route === undefined) return;
        try {
          await renderRoute(route, strict);
          ok++;
        } catch (e) {
          failed++;
          warn(`route ${route} failed: ${e.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
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

  await browser.close().catch(() => {});
  server.close();
  const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
  const scope = PRERENDER_ENTITIES ? `${ROUTES.length} hub + ${entityTotal} entity` : `${ROUTES.length} hub`;
  console.log(
    `[prerender] done in ${totalSeconds}s: ${ok} prerendered, ${failed} failed, ` +
      `${entityUnrendered.length} over budget, of ${scope} routes; ` +
      `stripped ${strippedTotal} runtime-injected modulepreload link(s); ` +
      `restored ${restoredFontsTotal} async font link(s)`,
  );
}

main()
  .catch((e) => warn(`unexpected error (${e.message}) — leaving SPA build intact`))
  .finally(() => process.exit(0));
