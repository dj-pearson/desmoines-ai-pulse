#!/usr/bin/env node
/**
 * Inventory on the HAND-BUILT event hubs (WEB-SEO-013 AC5, applied to the
 * surface that never had a gate).
 *
 * AC5 exists because a URL that lists nothing is a doorway page: "at least 8
 * distinct qualifying events (or 6 restaurants) in the current window, else 301
 * to the parent". check-pseo-inventory.ts enforces that against the 244
 * generated pSEO pages. Nothing has ever applied it to the routes in
 * public/sitemap-static.xml, which are hand-written, prerendered, and submitted
 * to search engines in exactly the same way.
 *
 * Measured 2026-08-28:
 *
 *     /events/johnston          0     /events/urbandale         1
 *     /events/clive             0     /events/ankeny            2
 *     /events/windsor-heights   1     /events/altoona           3
 *                                     /events/west-des-moines  50
 *
 * IT ASKS THE DATABASE, NOT THE BUILT HTML, and the first version of this file
 * did the opposite. Counting ItemList entries out of dist/ looked cheaper and
 * was wrong twice over: a hub that renders NOTHING emits no ItemList at all, so
 * the emptiest pages were skipped as "no list here" - precisely the ones worth
 * catching - and /restaurants emitted an ItemList with zero itemListElement
 * while rendering restaurant links, so it reported as empty when it was not.
 * The DOM says what a page drew; only the query says what it had to draw.
 *
 * THAT SECOND EXAMPLE IS NOW HISTORY, and it is left here because the argument
 * survives it. /restaurants ships 20 itemListElement as of 2026-08-28. It also
 * used to declare numberOfItems 478 against those 20 - the total row count,
 * not the list - which check-prerender-content.mjs now gates on. Do not read
 * the sentence above as a current measurement; re-measure before quoting it.
 *
 * THE LOCATION LIST IS READ FROM src/lib/suburbs.ts, not restated here, and
 * each place filter from src/lib/eventAreas.ts, which is what EventsByLocation
 * filters on, so a suburb added there is covered without a second edit - the hand-maintained list problem this repo
 * keeps rediscovering. (It used to parse EventsByLocation.tsx, which stopped
 * holding the map when SUBURBS moved to suburbs.ts.)
 *
 * THE PREDICATES MIRROR THE PAGES: the three visibility filters from
 * applyEventVisibility, the start of today in Central time as the floor
 * (upcomingFloorUtc), and for /events/free the terms of FREE_PRICE_FILTER,
 * which has no price.is.null.
 *
 * REPORTS, DOES NOT GATE. Each entry needs the per-URL decision AC5 describes -
 * 301 to the parent, unpublish, or accept - and the counts move with live data,
 * so a gate would be red in any quiet week. Same reasoning, and the same exit 0,
 * as check-pseo-inventory.ts.
 *
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 *
 *   npm run check-hub-inventory
 */
import { readFileSync, existsSync } from 'node:fs';

/** Straight from WEB-SEO-013 AC5. */
const FLOOR = 8;
const PAGE_SOURCE = 'src/lib/suburbs.ts';
const AREA_SOURCE = 'src/lib/eventAreas.ts';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnvFile('.env');
loadEnvFile('.env.local');

const BASE = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!BASE || !KEY) {
  console.error('[hub-inventory] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/**
 * Slug -> the PostgREST place filter EventsByLocation sends. The slugs are the
 * SUBURBS keys in suburbs.ts; the filter is eventAreaOrFilter() from
 * src/lib/eventAreas.ts (events-pass2 WP5 item 6): the area's city, or a null
 * city with a location ending ", <City>" / ", <City>, IA..." / ", <City>,
 * Iowa...". Both files are parsed so neither can drift from this script.
 * Throws rather than returning an empty set: a regex that stops matching would
 * otherwise report a clean surface.
 */
function readLocations() {
  const suburbs = readFileSync(PAGE_SOURCE, 'utf8');
  const block = suburbs.slice(suburbs.indexOf('export const SUBURBS'), suburbs.indexOf('export type SuburbSlug'));
  const slugs = [...block.matchAll(/^ {2}["']?([a-z-]+)["']?\s*:\s*\{/gm)].map((m) => m[1]);

  const areas = readFileSync(AREA_SOURCE, 'utf8');
  const cityOf = new Map();
  for (const m of areas.matchAll(/\{\s*slug:\s*"([^"]+)"[^}]*?kind:\s*"city",\s*city:\s*"([^"]+)"([^}]*)\}/g)) {
    cityOf.set(m[1], { city: m[2], fallback: /locationFallback:\s*true/.test(m[3]) });
  }

  const out = [];
  for (const slug of slugs) {
    const area = cityOf.get(slug);
    if (!area) throw new Error(`${slug} is a SUBURBS key with no city area in ${AREA_SOURCE}.`);
    const { city, fallback } = area;
    const locations = [`%, ${city}`, `%, ${city}, IA%`, `%, ${city}, Iowa%`]
      .map((p) => `location.ilike."${p}"`)
      .join(',');
    out.push({ slug, or: fallback ? `city.ilike.${city},and(city.is.null,or(${locations}))` : `city.ilike.${city}` });
  }
  if (out.length === 0) {
    throw new Error(`no locations parsed from ${PAGE_SOURCE} - the check is blind, refusing to pass.`);
  }
  return out;
}

async function countUpcoming(params) {
  const res = await fetch(`${BASE}/rest/v1/events?${params}`, {
    headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`events: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Start of today in America/Chicago as a UTC ISO string: upcomingFloorUtc()
 * from src/lib/timezone.ts, restated because this is a plain .mjs script.
 * Central midnight is 05:00Z (CDT) or 06:00Z (CST); pick whichever reads 00
 * on the Chicago clock.
 */
function centralTodayFloor(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [y, m, d] = day.split('-').map(Number);
  const hourIn = (ms) =>
    Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(ms));
  for (const utcHour of [5, 6]) {
    const ms = Date.UTC(y, m - 1, d, utcHour);
    if (hourIn(ms) === 0) return { day, floor: new Date(ms).toISOString() };
  }
  throw new Error(`could not place Central midnight for ${day}`);
}

const { day: today, floor } = centralTodayFloor();
const rows = [];

/** Upcoming and visible: the predicates every events page applies. */
function upcomingParams() {
  const params = new URLSearchParams({ select: 'id', date: `gte.${floor}` });
  params.set('is_merged', 'neq.true');
  params.set('is_hidden', 'neq.true');
  params.set('archived_at', 'is.null');
  return params;
}

for (const { slug, or } of readLocations()) {
  // Mirrors EventsByLocation's own place filter (eventAreaOrFilter).
  const params = upcomingParams();
  params.set('or', `(${or})`);
  rows.push({ route: `/events/${slug}`, count: await countUpcoming(params) });
}

// /events/free is not a location and its filter is the one in FreeEvents.tsx.
{
  const params = upcomingParams();
  // FREE_PRICE_FILTER from src/lib/eventPrice.ts: "free" text that names no
  // nonzero amount, or a literal $0 / 0.
  params.set('or', '(and(price.ilike.%free%,price.not.match.[$] *[1-9]),price.eq.$0,price.eq.0)');
  rows.push({ route: '/events/free', count: await countUpcoming(params) });
}

rows.sort((a, b) => a.count - b.count);

const empty = rows.filter((r) => r.count === 0);
const thin = rows.filter((r) => r.count > 0 && r.count < FLOOR);
const pass = rows.filter((r) => r.count >= FLOOR);

console.log(`[hub-inventory] ${rows.length} hand-built hub(s) against AC5's floor of ${FLOOR}, as of ${today}.`);
if (empty.length) {
  console.log(`\nEMPTY (${empty.length}) - sitemapped and listing nothing:`);
  for (const r of empty) console.log(`  ${r.route}`);
}
if (thin.length) {
  console.log(`\nTHIN (${thin.length}) - below the floor:`);
  for (const r of thin) console.log(`  ${String(r.count).padStart(3)}  ${r.route}`);
}
if (pass.length) {
  console.log(`\nPASS (${pass.length}):`);
  for (const r of pass) console.log(`  ${String(r.count).padStart(3)}  ${r.route}`);
}
console.log(
  `\n[hub-inventory] ${empty.length} empty, ${thin.length} thin, ${pass.length} at or above the floor. ` +
    'Reported, not gated - each needs the 301-or-unpublish decision AC5 describes.',
);
