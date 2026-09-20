/**
 * Core Web Vitals against the production build, on a throttled mobile profile.
 * WEB-PERF-020 AC2/AC3, WEB-SEO-032 AC4.
 *
 * Usage:
 *   VITE_SUPABASE_URL=https://placeholder.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=placeholder npx vite build
 *   npx vite preview --host 127.0.0.1 --port 4173 &
 *   node scripts/measure-vitals.mjs <label>
 *
 * WHY THE BACKEND IS STUBBED. A container with no Supabase credentials gets a
 * failed query on every route, so /events and /restaurants render their error
 * branch - and an LCP measured on a page whose largest element never arrives
 * is not that page's LCP. This is why AC2 sat blocked. page.route() serves
 * fixture rows instead, so the DOM under test is the one a reader gets.
 *
 * WHAT THESE NUMBERS ARE. Localhost: no network leg to Supabase, assets off
 * disk, and the SPA shell rather than the prerendered HTML Cloudflare Pages
 * serves in production. Treat the absolute LCP as an upper bound. What carries
 * information is the comparison between two builds of the same tree on the
 * same profile, and WHICH ELEMENT the browser picks as the LCP candidate -
 * that answer does not depend on the host.
 *
 * TWO CONSENT STATES, because they measure different pages. On a first visit
 * the cookie banner is the largest element painted, so it IS the LCP and the
 * content behind it is invisible to the metric. Seeding a stored consent
 * record measures the returning visitor, where the page's own content is the
 * candidate. Both are real; the first is what field data mostly sees.
 */
import { chromium } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function writeFixturePng(target, w = 1200, h = 675) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    raw[o] = 0;
    for (let x = 0; x < w; x++) {
      raw[o + 1 + x * 3] = 80;
      raw[o + 2 + x * 3] = 120;
      raw[o + 3 + x * 3] = 200;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(
    target,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:4173';
const IMG = `${BASE}/pw-fixture.png`;
const LABEL = process.argv[2] || 'run';

// A real PNG so the browser has something to decode and lay out; a data: URI
// would skip the network path the lazy/eager distinction is about.
writeFixturePng(new URL('../dist/pw-fixture.png', import.meta.url));

const restaurants = Array.from({ length: 12 }, (_, i) => ({
  id: `10000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
  name: `Fixture Restaurant ${i}`, description: 'A restaurant used for measurement.',
  cuisine_type: 'American', category: 'American', price_range: '$$',
  address: `${100 + i} Locust St`, city: 'Des Moines', state: 'IA',
  image_url: IMG, rating: 4.4, latitude: 41.58 + i * 0.001, longitude: -93.62,
  slug: `fixture-restaurant-${i}`, is_featured: i < 2,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}));

const events = Array.from({ length: 12 }, (_, i) => ({
  id: `20000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
  title: `Fixture Event ${i}`, description: 'An event used for measurement.',
  category: 'Music', date: '2026-10-01', start_time: '19:00:00',
  location: 'Des Moines', city: 'Des Moines', state: 'IA',
  image_url: IMG, price: 'Free', slug: `fixture-event-${i}`, is_featured: i < 2,
  latitude: 41.58, longitude: -93.62,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}));

function fixtureFor(url) {
  if (/\/rest\/v1\/restaurants/.test(url)) return restaurants;
  if (/\/rest\/v1\/events/.test(url)) return events;
  if (/\/rest\/v1\/attractions|playgrounds|articles|itineraries/.test(url)) return [];
  return [];
}

async function measure(browser, path, consented, desktop) {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: { width: 1280, height: 900 } }
      : {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        },
  );
  const page = await ctx.newPage();

  // LCP, layout-shift and longtask entries are NOT retrievable via
  // getEntriesByType - the buffer is only exposed to a PerformanceObserver.
  // Registering before any app code runs is the only way to see the first
  // paint's entries at all.
  if (consented) {
    // The cookie banner is the LCP element on a FIRST visit, which hides what
    // the card images do. Seeding a stored consent record measures the
    // returning visitor, where the page's own content is the candidate.
    // Shape and key from src/components/CookieConsentBanner.tsx.
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({
            version: '2026-04-13',
            timestamp: new Date().toISOString(),
            essential: true,
            preferences: true,
            analytics: true,
            advertising: true,
          }),
        );
      } catch {
        /* private mode: the banner shows and the run is labelled first-visit */
      }
    });
  }

  await page.addInitScript(() => {
    const w = window;
    w.__vitals = { lcp: null, lcpEl: null, cls: 0, tbt: 0 };
    new PerformanceObserver((list) => {
      const e = list.getEntries().at(-1);
      if (e) {
        w.__vitals.lcp = Math.round(e.startTime);
        w.__vitals.lcpEl = e.element || null;
        w.__vitals.lcpSize = e.size;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) w.__vitals.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__vitals.tbt += Math.max(0, e.duration - 50);
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.route('**/placeholder.supabase.co/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-11/12' },
      body: JSON.stringify(fixtureFor(route.request().url())),
    }),
  );

  const cdp = await ctx.newCDPSession(page);
  // Moto G Power / Lighthouse mobile: 4x CPU, Slow 4G.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const m = await page.evaluate(() => {
    const v = window.__vitals;
    const el = v.lcpEl;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      lcp: v.lcp,
      lcpElement: el
        ? `${el.tagName.toLowerCase()}${
            el.tagName === 'IMG'
              ? ` ...${(el.getAttribute('src') || '').slice(-18)} loading=${el.getAttribute('loading')} fp=${el.getAttribute('fetchpriority')}`
              : ` "${(el.textContent || '').trim().slice(0, 34)}"`
          }`
        : '(none)',
      cls: Math.round(v.cls * 1000) / 1000,
      tbt: Math.round(v.tbt),
      fcp: fcp ? Math.round(fcp.startTime) : null,
    };
  });

  await ctx.close();
  return m;
}

const browser = await chromium.launch({ executablePath: EXEC });
for (const desktop of [false, true]) {
  for (const consented of [false, true]) {
    for (const path of ['/', '/restaurants', '/events']) {
      const m = await measure(browser, path, consented, desktop);
      console.log(
        `${LABEL.padEnd(7)} ${(desktop ? 'desktop' : 'mobile').padEnd(8)} ${(consented ? 'returning' : 'first-vis').padEnd(10)} ${path.padEnd(13)} LCP ${String(m.lcp).padStart(5)}ms  FCP ${String(m.fcp).padStart(5)}ms  CLS ${String(m.cls).padEnd(6)} TBT ${String(m.tbt).padStart(5)}ms  <- ${m.lcpElement}`,
      );
    }
  }
}
await browser.close();
