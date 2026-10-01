#!/usr/bin/env node
/**
 * SEO-034. Does a restaurant page answer the query in its prerendered HTML?
 *
 * Takes the top N restaurant URLs by Search Console impressions, renders each
 * one from dist/ the way scripts/prerender.mjs does (same static server with
 * SPA fallback, same window.__DMI_PRERENDER__ flag, same settle signals), and
 * reports which answers are in the HTML and whether they sit ABOVE THE FOLD,
 * meaning between the <h1> and the first <h2> of #main-content.
 *
 * Each field is scored against the row, so a page is not marked down for a
 * fact the database does not have: "phone 30/41" means 41 of the rows carry a
 * phone and 30 of their pages show it above the fold.
 *
 * Usage:
 *   npx vite build                     (dist/ must exist; .env supplies Supabase)
 *   node scripts/measure-restaurant-answer.mjs --pages <Pages.csv> [--top 50] [--out file.json]
 *
 * Reads production with the anon key (restaurants is a public read). Writes
 * nothing to the database.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PAGES_CSV = arg('pages', null);
const TOP = Number(arg('top', '50'));
const OUT = arg('out', null);
const DIST = path.resolve('dist');

if (!PAGES_CSV || !fs.existsSync(PAGES_CSV)) {
  console.error('Pass --pages <Search Console Pages.csv>.');
  process.exit(2);
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing: run `npx vite build` first.');
  process.exit(2);
}

function readEnv() {
  const env = { ...process.env };
  if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = readEnv();
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set.');
  process.exit(2);
}

/** Top restaurant paths by impressions. */
function topRestaurantPaths() {
  const rows = fs
    .readFileSync(PAGES_CSV, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => c.length >= 3 && /\/restaurants\/[^/?#]+$/.test(c[0]))
    .map((c) => ({ path: new URL(c[0]).pathname, impressions: Number(c[2]) || 0 }))
    .filter((r) => !['open-now', 'new', 'dietary'].includes(r.path.split('/')[2]));
  rows.sort((a, b) => b.impressions - a.impressions);
  return rows.slice(0, TOP);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchRow(slug) {
  // The page resolves a uuid by id (RestaurantDetails.tsx); so does this.
  const column = UUID_RE.test(slug) ? 'id' : 'slug';
  const res = await fetch(`${SB_URL}/rest/v1/restaurants?${column}=eq.${encodeURIComponent(slug)}&select=*&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
};

function startServer() {
  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'));
  const server = http.createServer((req, res) => {
    try {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
      const file = path.join(DIST, rel);
      if (rel && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
    } catch {
      /* SPA fallback */
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function render(browser, port, route) {
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument(() => {
      window.__DMI_PRERENDER__ = true;
    });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !!document.querySelector('#main-content h1'), { timeout: 20000 }).catch(() => {});
    await page
      .waitForFunction(() => document.documentElement.dataset.queriesSettled === 'true', { timeout: 10000 })
      .catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return await page.evaluate(() => {
      const main = document.getElementById('main-content');
      const h1 = main?.querySelector('h1');
      // Everything between the h1 and the first h2 that follows it, in document order.
      let fold = '';
      let foldLinks = [];
      if (main && h1) {
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let started = false;
        let node;
        while ((node = walker.nextNode())) {
          if (node === h1) {
            started = true;
            continue;
          }
          if (!started) continue;
          if (node.nodeType === 1 && node.tagName === 'H2') break;
          if (node.nodeType === 3) fold += ` ${node.textContent}`;
          if (node.nodeType === 1 && node.tagName === 'A') {
            foldLinks.push({ text: (node.textContent || '').trim(), href: node.getAttribute('href') || '' });
          }
        }
      }
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || '');
      const imgs = [...(main?.querySelectorAll('img') ?? [])].map((i) => i.getAttribute('alt') || '');
      const links = [...(main?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href') || '');
      return {
        h1: h1?.textContent?.trim() ?? '',
        fold: fold.replace(/\s+/g, ' ').trim(),
        foldLinks,
        ld,
        imgs,
        links,
        text: (main?.textContent || '').replace(/\s+/g, ' '),
      };
    });
  } finally {
    await page.close();
  }
}

function restaurantNode(ldBlocks) {
  for (const raw of ldBlocks) {
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
    for (const n of nodes) {
      const t = n && n['@type'];
      if (t === 'Restaurant' || (Array.isArray(t) && t.includes('Restaurant'))) return n;
    }
  }
  return null;
}

function webPageNode(ldBlocks) {
  for (const raw of ldBlocks) {
    try {
      const json = JSON.parse(raw);
      const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
      const hit = nodes
        .flatMap((n) => [n, n && n.mainEntityOfPage])
        .find((n) => n && n['@type'] === 'WebPage' && n.dateModified);
      if (hit) return hit;
    } catch {
      /* skip */
    }
  }
  return null;
}

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const isTier = (p) => /^\${1,4}$/.test(String(p ?? '').trim());
function hasHours(row) {
  return Array.isArray(row?.hours_json?.periods) && row.hours_json.periods.length > 0;
}
function closedForGood(row) {
  return (
    ['closed', 'permanently_closed'].includes(String(row?.status ?? '').toLowerCase()) ||
    String(row?.business_status ?? '').toUpperCase() === 'CLOSED_PERMANENTLY'
  );
}
function streetOf(location) {
  const first = String(location ?? '').split(',')[0].trim();
  return /\d/.test(first) ? first : null;
}
function localityOf(row) {
  const parts = String(row?.location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length && /^(usa|us)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length >= 3 && /^(IA|Iowa)\b/i.test(parts[parts.length - 1])) return parts[parts.length - 2];
  return (row?.city ?? '').trim() || null;
}

/** src/lib/neighborhoods.ts NEIGHBORHOODS slugs (plain JS here; check-neighborhoods guards that file). */
const NEIGHBORHOOD_SLUGS = new Set([
  'east-village',
  'west-des-moines',
  'ankeny',
  'urbandale',
  'johnston',
  'clive',
  'waukee',
  'altoona',
]);

/** Restaurant JSON-LD properties, each applicable only when the row backs it. */
const LD_PROPS = {
  servesCuisine: (r) => !!r.cuisine,
  priceRange: (r) => isTier(r.price_range),
  hasMenu: (r) => !!(r.menu_url && /^https?:/i.test(r.menu_url)),
  openingHoursSpecification: (r) =>
    hasHours(r) &&
    !closedForGood(r) &&
    !['opening_soon', 'announced'].includes(String(r.status ?? '').toLowerCase()) &&
    String(r.business_status ?? '').toUpperCase() !== 'CLOSED_TEMPORARILY',
  acceptsReservations: (r) => typeof r.reservable === 'boolean' || !!r.reservation_url,
  geo: (r) => r.latitude != null && r.longitude != null,
  sameAs: (r) => !!(r.website || r.google_maps_uri),
  address: (r) => !!r.location,
};

/** One field: applicable (the row has it) and present (the page shows it). */
function score(row, page) {
  const fold = page.fold;
  const node = restaurantNode(page.ld);
  const out = {};
  const closed = closedForGood(row);

  // A not-yet-open or temporarily closed place shows a notice instead of hours.
  const notOpen =
    ['opening_soon', 'announced'].includes(String(row.status ?? '').toLowerCase()) ||
    String(row.business_status ?? '').toUpperCase() === 'CLOSED_TEMPORARILY';
  const hoursApplicable = hasHours(row) && !closed && !notOpen;
  out.hours = {
    applicable: hoursApplicable,
    present:
      hoursApplicable &&
      (/\bopen\b[^.]{0,60}\b(\d{1,2}(:\d{2})? ?(am|pm)|noon|midnight|24 hours)/i.test(fold) ||
        /\bclosed on \w+days\b/i.test(fold)),
  };
  out.price = { applicable: isTier(row.price_range), present: isTier(row.price_range) && fold.includes(row.price_range.trim()) };
  const menuApplicable = !!(row.menu_url && /^https?:/i.test(row.menu_url));
  out.menu = {
    applicable: menuApplicable,
    present: menuApplicable && page.foldLinks.some((l) => /menu/i.test(l.text) && l.href),
  };
  const street = streetOf(row.location);
  const locality = localityOf(row);
  const addrApplicable = !!(street && locality);
  out.address = {
    applicable: addrApplicable,
    present: addrApplicable && fold.includes(street) && fold.toLowerCase().includes(locality.toLowerCase()),
  };
  const phoneApplicable = digits(row.phone).length >= 10 && !closed;
  out.phone = {
    applicable: phoneApplicable,
    present: phoneApplicable && digits(fold).includes(digits(row.phone).slice(-10)),
  };
  out.closedState = { applicable: closed, present: closed && /permanently closed|closed permanently/i.test(fold) };
  // Worded "last updated" on the page: updated_at is when the row changed, not a check.
  out.lastUpdated = { applicable: !!row.updated_at, present: !!row.updated_at && /last (verified|updated)/i.test(page.text) };
  out.altNamesRestaurant = {
    applicable: !!row.image_url,
    present: !!row.image_url && page.imgs.some((a) => a.toLowerCase().includes(String(row.name).toLowerCase())),
  };

  // Internal links anywhere in #main-content; "applicable" is every page, as
  // not every place has an area page.
  // The restaurant's OWN suburb page (site chrome links every neighbourhood,
  // so "any /neighborhoods/ link" would count nothing).
  const hoodSlug = (localityOf(row) ?? '').toLowerCase().replace(/\s+/g, '-');
  const hoodApplicable = NEIGHBORHOOD_SLUGS.has(hoodSlug);
  out['link.ownNeighborhood'] = {
    applicable: hoodApplicable,
    present: hoodApplicable && page.links.includes(`/neighborhoods/${hoodSlug}`),
  };
  out['link.cuisineArea'] = {
    applicable: true,
    present: page.links.some((h) => /^\/(italian|mexican|asian|bbq|brunch|coffee|steakhouse|pizza)\/[a-z-]+$/.test(h)),
  };

  for (const [p, applies] of Object.entries(LD_PROPS)) {
    const applicable = applies(row);
    out[`ld.${p}`] = { applicable, present: applicable && !!(node && node[p] != null && node[p] !== '') };
  }
  // Wanted ABSENT: the only rating we hold is Google's, which is not first-party.
  out['ld.aggregateRating (should be 0)'] = { applicable: true, present: !!(node && node.aggregateRating) };
  out['ld.webPageDateModified'] = { applicable: true, present: !!webPageNode(page.ld) };
  out.restaurantNode = { applicable: true, present: !!node };
  return out;
}

async function main() {
  const puppeteer = (await import('puppeteer')).default;
  const targets = topRestaurantPaths();
  const server = await startServer();
  const port = server.address().port;
  const browsers = await Promise.all([0, 1, 2].map(() => puppeteer.launch({ headless: true, args: ['--no-sandbox'] })));

  const results = [];
  let next = 0;
  async function worker(browser) {
    while (next < targets.length) {
      const t = targets[next++];
      const slug = t.path.split('/')[2];
      const row = await fetchRow(slug);
      if (!row) {
        results.push({ ...t, slug, missingRow: true });
        continue;
      }
      try {
        const page = await render(browser, port, t.path);
        results.push({ ...t, slug, h1: page.h1, fold: page.fold, scores: score(row, page) });
      } catch (e) {
        results.push({ ...t, slug, error: String(e && e.message ? e.message : e) });
      }
    }
  }
  await Promise.all(browsers.map(worker));
  await Promise.all(browsers.map((b) => b.close()));
  server.close();

  const measured = results.filter((r) => r.scores);
  const fields = Object.keys(measured[0]?.scores ?? {});
  console.log(`Measured ${measured.length} of ${targets.length} pages (top ${TOP} restaurants by impressions).`);
  const skipped = results.filter((r) => !r.scores);
  for (const s of skipped) console.log(`  skipped ${s.path}: ${s.missingRow ? 'no row for slug' : s.error}`);
  console.log('\nfield                         present / applicable');
  const summary = {};
  for (const f of fields) {
    const app = measured.filter((r) => r.scores[f].applicable).length;
    const pres = measured.filter((r) => r.scores[f].present).length;
    summary[f] = { present: pres, applicable: app };
    console.log(`${f.padEnd(30)}${String(pres).padStart(3)} / ${app}`);
  }
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), summary, results }, null, 2));
    console.log(`\nWrote ${OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
