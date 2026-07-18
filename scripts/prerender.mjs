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
 * Detail pages (/events/:slug, /restaurants/:slug, ...) are data-driven and
 * intentionally out of scope here; a follow-up can enumerate them from the DB.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stripLazyPreloads } from './lazy-preload-patterns.mjs';
import process from 'node:process';

const DIST = path.resolve('dist');
const PORT = 4178;

// Curated public, static (non-param, non-auth, non-admin) routes worth indexing.
const ROUTES = [
  '/',
  '/events',
  '/events/today',
  '/events/free',
  '/events/kids',
  '/events/date-night',
  '/events/ankeny',
  '/events/urbandale',
  '/events/johnston',
  '/events/altoona',
  '/events/clive',
  '/restaurants',
  '/restaurants/open-now',
  '/restaurants/dietary',
  '/attractions',
  '/playgrounds',
  '/stay',
  '/articles',
  '/guides',
  '/weekend',
  '/neighborhoods',
  '/iowa-state-fair',
  '/calendar',
  '/deals',
  '/map',
  '/trip-planner',
  '/itineraries',
  '/pricing',
  '/business',
  '/advertise',
  '/search',
];

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
  for (const route of ROUTES) {
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
      const [html, strippedPreloads] = stripLazyPreloads(captured);
      if (strippedPreloads > 0) {
        strippedTotal += strippedPreloads;
      }
      // Sanity: only write if we captured a real document with our root.
      if (!html || !html.includes('<div id="root"')) {
        throw new Error('captured HTML missing #root');
      }

      const outDir = route === '/' ? DIST : path.join(DIST, route);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html);
      ok++;
    } catch (e) {
      failed++;
      warn(`route ${route} failed: ${e.message}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  await browser.close().catch(() => {});
  server.close();
  console.log(`[prerender] done: ${ok} prerendered, ${failed} skipped, of ${ROUTES.length} routes; stripped ${strippedTotal} runtime-injected modulepreload link(s)`);
}

main()
  .catch((e) => warn(`unexpected error (${e.message}) — leaving SPA build intact`))
  .finally(() => process.exit(0));
