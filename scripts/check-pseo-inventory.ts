#!/usr/bin/env node
/**
 * WEB-SEO-013 AC5 - the inventory gate.
 *
 * "Enforce an inventory gate before publishing any page: at least 8 distinct
 *  qualifying events (or 6 restaurants) in the current window, else 301 to the
 *  parent. This is the single control that separates this from doorway pages."
 *
 * This is the measuring half, and it measures the thing that matters: for every
 * published row in pseo_pages, how many entities the page's OWN listing query
 * returns from production right now.
 *
 * IT REPLAYS THE COMPONENT'S QUERY, IT DOES NOT APPROXIMATE IT. The category
 * patterns and temporal windows are IMPORTED from src/pseo/listingFilters.ts,
 * the same module PseoLiveListings uses, so the two cannot drift. A gate that
 * counts differently from the page it guards is worse than no gate: it passes
 * pages that render empty and fails pages that render fine.
 *
 * ATTAINABLE is the second number, and the pair is the whole point. RENDERED is
 * what the page shows; ATTAINABLE relaxes the one filter the data cannot
 * support - location, which the component matches by display name against
 * events.city (NULL on 1,243 of 1,249 rows) - and matches it the way
 * EventsByLocation.tsx does, on location||venue substrings. RENDERED 0 /
 * ATTAINABLE 0 is a page with no inventory: unpublish it. RENDERED 0 /
 * ATTAINABLE 20 is a page whose inventory exists but is not addressable by the
 * fields we store. Collapsing them loses which fix applies.
 *
 * Run it with tsx, not node - it imports a TypeScript module by design.
 *
 * IT READS PRODUCTION, so it does not run in CI: there is no key in a PR job,
 * and pseo_pages is data rather than code. Run it before a generation batch and
 * after one. `npm run check-pseo-inventory`.
 *
 * Exit code is always 0. This reports; it does not gate. What to do with a thin
 * page - 301 to the parent, unpublish, or hold the batch - is the owner's call
 * under AC5/AC6.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_FILTERS, temporalRange } from '../src/pseo/listingFilters';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Straight from AC5. attractions has no stated floor; 6 is used and worth
// noting, since the whole table holds 22 rows.
const FLOOR = { events: 8, restaurants: 6, attractions: 6 };

// --------------------------------------------------------------------------
// Transcribed from PseoLiveListings.resolveEntityType.
const RESTAURANT_CATEGORIES = ['italian', 'mexican', 'asian', 'bbq', 'brunch', 'coffee', 'steakhouse'];
const EVENT_CATEGORIES = ['live-music', 'festivals', 'arts-culture', 'sports', 'farmers-markets'];

function resolveEntityType(contentSlug, categorySlug) {
  if (contentSlug === 'restaurants') return 'restaurants';
  if (contentSlug === 'attractions') return 'attractions';
  if (contentSlug === 'events' || contentSlug === 'things-to-do' || contentSlug === 'nightlife') return 'events';
  if (categorySlug && RESTAURANT_CATEGORIES.includes(categorySlug)) return 'restaurants';
  if (categorySlug && EVENT_CATEGORIES.includes(categorySlug)) return 'events';
  return 'events';
}

// The PostgREST query the component builds, as URL parameters. Mirrors
// fetchListings() in PseoLiveListings.tsx; the predicates themselves come from
// the shared module rather than being restated here.
function renderedQuery(entityType, dims, nowIso) {
  const { location, category, temporal } = dims;
  const cat = category ? CATEGORY_FILTERS[category.slug] : undefined;
  // Mirrors the component's incoherent-page guard: a cuisine category on an
  // events page (and vice versa) lists nothing rather than everything.
  if (category && cat && cat.entity !== entityType) return [null, null];
  const p = new URLSearchParams();
  p.set('select', 'id');

  if (entityType === 'events') {
    p.append('date', `gte.${nowIso}`);
    p.append('is_hidden', 'neq.true');
    p.set('order', 'date.asc');
    if (location) {
      p.set('or', `(city.ilike.*${location.name}*,location.ilike.*${location.name}*,venue.ilike.*${location.name}*)`);
    }
    if (cat?.entity === 'events') p.append(cat.column, `imatch.${cat.pattern}`);
    if (temporal) {
      const range = temporalRange(temporal.slug);
      if (range) {
        p.append('date', `gte.${range.from}`);
        p.append('date', `lte.${range.to}`);
      }
    }
    return ['events', p];
  }

  if (entityType === 'restaurants') {
    p.set('order', 'rating.desc');
    if (location) p.set('or', `(city.ilike.*${location.name}*,location.ilike.*${location.name}*)`);
    if (cat?.entity === 'restaurants') p.append(cat.column, `imatch.${cat.pattern}`);
    return ['restaurants', p];
  }

  p.set('order', 'name.asc');
  if (location) p.append('location', `ilike.*${location.name}*`);
  return ['attractions', p];
}

// --------------------------------------------------------------------------
// ATTAINABLE: the same dimensions, filtered the way the data is actually
// shaped. These are not proposals for how the component should work - they are
// a ceiling, answering "is there anything here at all".
//
// The ONE relaxation is location. Everything else - category patterns, temporal
// windows - reuses the shared module, so ATTAINABLE differs from RENDERED on
// exactly one axis and the gap is attributable.
function attainableCategoryMatch(slug, table, row) {
  const cat = CATEGORY_FILTERS[slug];
  if (!cat || cat.entity !== table) return false;
  return new RegExp(cat.pattern, 'i').test(String(row[cat.column] || ''));
}

// Location terms, matched against the fields the hand-built location page
// matches (EventsByLocation.tsx:138-147), reusing its search-term lists.
// downtown is 'downtown' alone, deliberately. Adding 'des moines' as a second
// term would match every venue in the city and report a downtown page as having
// 101 qualifying events when it has one - an inflated ceiling is worse here than
// no ceiling, because it turns "no inventory" into "broken filter".
const LOCATION_TERMS = {
  downtown: ['downtown'],
  'east-village': ['east village'],
  'valley-junction': ['valley junction'],
  'west-des-moines': ['west des moines', 'wdm', 'valley junction'],
  ankeny: ['ankeny'],
};

// AUDIENCE selects nothing anywhere. There is no audience column, tag or join
// on events, restaurants or attractions, so "for families", "date night",
// "budget", "foodies" and "for visitors" can be asserted by generated prose and
// by nothing else. Pages narrowed only by audience get their own verdict,
// because the fix differs: thin needs inventory, unfilterable needs a way to
// tell which entities qualify at all.

function locationText(table, row) {
  if (table === 'events') return `${row.location || ''} ${row.venue || ''}`.toLowerCase();
  if (table === 'restaurants') return `${row.location || ''} ${row.city || ''}`.toLowerCase();
  return `${row.location || ''} ${row.address || ''}`.toLowerCase();
}

function attainable(entityType, dims, data, now) {
  let rows = data[entityType];
  if (entityType === 'events') {
    const todayKey = now.toISOString().slice(0, 10);
    rows = rows.filter((e) => e.date && String(e.date).slice(0, 10) >= todayKey);
  }
  if (dims.category) {
    rows = rows.filter((r) => attainableCategoryMatch(dims.category.slug, entityType, r));
  }
  if (dims.location) {
    const terms = LOCATION_TERMS[dims.location.slug] || [dims.location.name.toLowerCase()];
    rows = rows.filter((r) => terms.some((t) => locationText(entityType, r).includes(t)));
  }
  if (dims.temporal && entityType === 'events') {
    const range = temporalRange(dims.temporal.slug, now);
    if (range) {
      rows = rows.filter((r) => {
        const key = String(r.date).slice(0, 10);
        return key >= range.from && key <= range.to;
      });
    }
  }
  return rows;
}

// --------------------------------------------------------------------------
function env() {
  let text = '';
  try {
    text = readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch {
    text = '';
  }
  const out = { ...process.env };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const E = env();
const BASE = (E.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = E.VITE_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required (read from .env or the environment).');
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function fetchAll(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${offset}`, {
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`${table}: ${JSON.stringify(page).slice(0, 200)}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

/** Runs the component's own query and returns the matching ids (capped at 12,
 *  as the component caps) plus the exact total behind that cap. */
async function runRendered(table, params) {
  params.set('limit', '12');
  // One flaky request must not abort a 244-request audit and leave a partial
  // report that reads like a finding. Retried twice, then reported as an error
  // on that row rather than swallowed.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/rest/v1/${table}?${params}`, {
        headers: { ...HEADERS, Prefer: 'count=exact' },
      });
      if (!res.ok) return { ids: [], total: 0, error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
      const body = await res.json();
      const range = res.headers.get('content-range') || '';
      const total = Number(range.split('/')[1]);
      return { ids: body.map((r) => r.id), total: Number.isFinite(total) ? total : body.length };
    } catch (err) {
      if (attempt === 2) return { ids: [], total: 0, error: `fetch failed: ${String(err).slice(0, 120)}` };
    }
  }
  return { ids: [], total: 0, error: 'unreachable' };
}

// --------------------------------------------------------------------------
const now = new Date();
const nowIso = now.toISOString();

const pages = (await fetchAll('pseo_pages', 'id,slug,page_type_id,dimensions,is_published')).filter(
  (p) => p.is_published,
);
const data = {
  events: await fetchAll('events', 'id,title,date,location,venue,category,is_hidden'),
  restaurants: await fetchAll('restaurants', 'id,name,location,city,cuisine'),
  attractions: await fetchAll('attractions', 'id,name,location,address,type'),
};

console.log(
  `[pseo-inventory] ${pages.length} published page(s) against ${data.events.length} events, ` +
    `${data.restaurants.length} restaurants, ${data.attractions.length} attractions (${nowIso.slice(0, 10)})`,
);
console.log(
  `[pseo-inventory] floors: ${FLOOR.events} events / ${FLOOR.restaurants} restaurants / ${FLOOR.attractions} attractions`,
);
console.log('[pseo-inventory] RENDERED replays PseoLiveListings; ATTAINABLE is the same dimensions against the real data shape.\n');

const results = [];
for (const page of pages) {
  const dims = Object.fromEntries((page.dimensions || []).map((d) => [d.dimension, d]));
  const entityType = resolveEntityType(dims.content_type?.slug, dims.category?.slug);
  const [table, params] = renderedQuery(entityType, dims, nowIso);
  const rendered = table ? await runRendered(table, params) : { ids: [], total: 0 };
  const att = attainable(entityType, dims, data, now);

  const narrowing = Object.keys(dims).filter((k) => k !== 'content_type');
  const unfilterable = narrowing.length > 0 && narrowing.every((k) => k === 'audience');

  results.push({
    slug: page.slug,
    entityType,
    hasTemporal: Boolean(dims.temporal),
    rendered: rendered.total,
    error: rendered.error,
    attainable: att.length,
    fingerprint: rendered.ids.slice().sort().join('|'),
    unfilterable,
    passes: rendered.total >= FLOOR[entityType],
    attainablePasses: att.length >= FLOOR[entityType],
  });
}

const empties = results.filter((r) => r.rendered === 0);
const brokenFilter = empties.filter((r) => r.attainable > 0);
const noInventory = empties.filter((r) => r.attainable === 0);
const thin = results.filter((r) => r.rendered > 0 && !r.passes);
const pass = results.filter((r) => r.passes);

function show(title, rows, limit = 1000) {
  if (!rows.length) return;
  console.log(`${title}  (${rows.length})`);
  for (const r of rows.slice(0, limit)) {
    console.log(
      `  ${r.slug.padEnd(42)} rendered ${String(r.rendered).padStart(4)}  attainable ${String(r.attainable).padStart(4)}  ${r.entityType}${r.unfilterable ? '  [audience-only]' : ''}${r.error ? `  !! ${r.error}` : ''}`,
    );
  }
  if (rows.length > limit) console.log(`  ... and ${rows.length - limit} more`);
  console.log('');
}

show('EMPTY - the filter finds nothing but the inventory exists', brokenFilter, 25);
show('EMPTY - no inventory to find', noInventory, 25);
show('THIN - below the floor', thin, 25);
show('PASS', pass, 10);

// A page can clear the floor and still be a doorway page. Fingerprinting the
// ids the page actually renders is what surfaces that; the floor cannot.
const groups = new Map();
for (const r of results) {
  if (!r.fingerprint) continue;
  if (!groups.has(r.fingerprint)) groups.set(r.fingerprint, []);
  groups.get(r.fingerprint).push(r.slug);
}
const dupes = [...groups.values()].filter((s) => s.length > 1).sort((a, b) => b.length - a.length);
const dupePages = dupes.reduce((n, s) => n + s.length, 0);
console.log(`IDENTICAL LISTINGS  (${dupes.length} group(s), ${dupePages} page(s) sharing a listing with another URL)`);
for (const slugs of dupes.slice(0, 6)) {
  console.log(`  ${slugs.length} URLs render the same entities:`);
  for (const s of slugs) console.log(`      ${s}`);
}
if (dupes.length > 6) console.log(`  ... and ${dupes.length - 6} more group(s)`);
// AC4 asks for a cap on the initial release, and neither number above is the
// one to cap. The floor says 122 pages have inventory; the fingerprint says 144
// share a listing with another URL; the two sets overlap and nothing combined
// them. A page is worth publishing only when it clears the floor AND is the one
// URL for its listing - ship the other members of its group and they are
// doorway pages by the ordinary definition, several URLs rendering identical
// content to catch different queries.
//
// CANONICAL PREFERS AN EVERGREEN URL, then the shortest slug, ties broken
// lexicographically. Shortest alone was wrong and the output said so: it picked
// /asian/fall over /restaurants/asian. If every season renders the same
// restaurants then the season is not a dimension of that listing, and putting a
// month in the canonical URL for content that does not change with the month is
// the doorway pattern with a tidier name. It is a rule rather than a judgement
// so the number is reproducible between runs.
const passSlugs = new Set(pass.map((r) => r.slug));
const canonical = [];
const shadowed = [];
for (const slugs of groups.values()) {
  const passing = slugs.filter((s) => passSlugs.has(s));
  if (passing.length === 0) continue;
  const temporal = new Map(results.map((r) => [r.slug, r.hasTemporal]));
  const [head, ...rest] = passing
    .slice()
    .sort(
      (a, b) =>
        Number(temporal.get(a)) - Number(temporal.get(b)) ||
        a.length - b.length ||
        a.localeCompare(b),
    );
  canonical.push(head);
  shadowed.push(...rest);
}
canonical.sort();
console.log('');
console.log(`SHIPPABLE  (${canonical.length} of ${results.length} published)`);
console.log('  Clears the floor and is the only URL rendering its listing.');
for (const s of canonical.slice(0, 25)) console.log(`      ${s}`);
if (canonical.length > 25) console.log(`  ... and ${canonical.length - 25} more`);
if (shadowed.length) {
  console.log('');
  console.log(`  ${shadowed.length} page(s) clear the floor and duplicate a shippable page's listing:`);
  for (const s of shadowed.slice(0, 15)) console.log(`      ${s}`);
  if (shadowed.length > 15) console.log(`  ... and ${shadowed.length - 15} more`);
}

console.log(
  `\n[pseo-inventory] ${pass.length} pass, ${thin.length} thin, ${empties.length} empty ` +
    `(${brokenFilter.length} broken filter, ${noInventory.length} no inventory) - ` +
    `${Math.round(((results.length - pass.length) / results.length) * 100)}% of published pages do not clear AC5's floor.`,
);
