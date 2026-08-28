/**
 * WEB-SEO-013 - the shippable pSEO set, computed once for the two consumers
 * that must not disagree about it.
 *
 *   scripts/check-pseo-inventory.ts      reports it before and after a batch
 *   scripts/generate-dynamic-sitemaps.ts submits it to search engines
 *
 * The reason this is a shared module rather than two implementations: the
 * sitemap is the STRONGER signal. Leaving a thin or duplicate page merely
 * reachable is not the same as telling Google it is worth crawling, so a
 * generator that selects differently from the gate that reports on it would
 * publish exactly the pages the gate exists to catch, and the report would say
 * everything was fine.
 *
 * TWO FILTERS, AND THE SECOND IS THE ONE THE STORY'S FLOOR CANNOT SEE.
 *
 *   1. The AC5 inventory floor - at least 8 qualifying events, or 6 restaurants
 *      or attractions, returned by the page's OWN listing query right now.
 *   2. One URL per listing. A page can clear the floor and still be a doorway
 *      page: /bbq/august, /bbq/winter, /bbq/summer and /restaurants/bbq all
 *      return the same six restaurants, because restaurants do not vary by
 *      season. Measured 2026-08-27, 101 of the 123 pages that clear the floor
 *      render a listing identical to another passing page's.
 *
 * The listing is FINGERPRINTED by the ids the query actually returns, not
 * inferred from the slug. A slug-shaped rule would have to know that season is
 * a real dimension for events and a meaningless one for restaurant categories,
 * which is a judgement; the ids are a measurement.
 *
 * IT REPLAYS THE COMPONENT'S QUERY RATHER THAN APPROXIMATING IT. The category
 * patterns and temporal windows are imported from src/pseo/listingFilters.ts,
 * the same module PseoLiveListings uses, so the gate and the page it guards
 * cannot drift.
 *
 * IT READS PRODUCTION. Run it with tsx - it imports a TypeScript module by
 * design - and give it VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_FILTERS, temporalRange } from '../../src/pseo/listingFilters';
import { classifySlugs } from './pseoRouteClaims.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Straight from AC5. attractions has no stated floor; 6 is used and worth
 * noting, since the whole table holds 22 rows.
 */
export const FLOOR = { events: 8, restaurants: 6, attractions: 6 };

// --------------------------------------------------------------------------
// Transcribed from PseoLiveListings.resolveEntityType.
const RESTAURANT_CATEGORIES = ['italian', 'mexican', 'asian', 'bbq', 'brunch', 'coffee', 'steakhouse'];
const EVENT_CATEGORIES = ['live-music', 'festivals', 'arts-culture', 'sports', 'farmers-markets'];

export function resolveEntityType(contentSlug, categorySlug) {
  if (contentSlug === 'restaurants') return 'restaurants';
  if (contentSlug === 'attractions') return 'attractions';
  if (contentSlug === 'events' || contentSlug === 'things-to-do' || contentSlug === 'nightlife') return 'events';
  if (categorySlug && RESTAURANT_CATEGORIES.includes(categorySlug)) return 'restaurants';
  if (categorySlug && EVENT_CATEGORIES.includes(categorySlug)) return 'events';
  return 'events';
}

/**
 * The PostgREST query the component builds, as URL parameters. Mirrors
 * fetchListings() in PseoLiveListings.tsx; the predicates themselves come from
 * the shared module rather than being restated here.
 */
export function renderedQuery(entityType, dims, nowIso) {
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

export function attainable(entityType, dims, data, now) {
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

/**
 * Picks one URL per listing.
 *
 * CANONICAL PREFERS AN EVERGREEN URL, then the shortest slug, ties broken
 * lexicographically. Shortest alone was wrong and the output said so: it picked
 * /asian/fall over /restaurants/asian. If every season renders the same
 * restaurants then the season is not a dimension of that listing, and putting a
 * month in the canonical URL for content that does not change with the month is
 * the doorway pattern with a tidier name. It is a rule rather than a judgement
 * so the number is reproducible between runs.
 *
 * Exported and pure so it can be tested without a database.
 */
export function selectCanonical(results) {
  const groups = new Map();
  for (const r of results) {
    if (!r.fingerprint) continue;
    if (!groups.has(r.fingerprint)) groups.set(r.fingerprint, []);
    groups.get(r.fingerprint).push(r.slug);
  }

  // A claimed slug never renders the pSEO page (see pseoRouteClaims.mjs), so it
  // cannot be the canonical URL for a listing it does not show - and it must not
  // suppress the URL that does. Excluded before the group head is chosen, not
  // filtered out afterwards.
  const passSlugs = new Set(results.filter((r) => r.passes && !r.claimed).map((r) => r.slug));
  const temporal = new Map(results.map((r) => [r.slug, r.hasTemporal]));
  const canonical = [];
  const shadowed = [];
  const temporalOnlyByClaim = [];
  const claimedSlugs = new Set(results.filter((r) => r.claimed).map((r) => r.slug));

  for (const slugs of groups.values()) {
    const passing = slugs.filter((s) => passSlugs.has(s));
    if (passing.length === 0) continue;
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

    // THE RULE ABOVE PREFERS AN EVERGREEN URL AND CANNOT ALWAYS GET ONE. When
    // the evergreen sibling is claimed by an entity-detail route
    // (/restaurants/asian resolves to RestaurantDetails, not to the pSEO page),
    // the only servable URL left for that listing carries a season it does not
    // honour - which is the doorway pattern the rule exists to avoid, arrived at
    // from the other direction. Reported rather than dropped: the fix is the
    // AC7 routing decision about who owns /restaurants/<category>, and silently
    // publishing nothing for those listings would hide the question.
    if (temporal.get(head)) {
      const evergreenClaimed = slugs.filter((s) => claimedSlugs.has(s) && !temporal.get(s));
      if (evergreenClaimed.length) {
        temporalOnlyByClaim.push({ canonical: head, claimed: evergreenClaimed });
      }
    }
  }

  canonical.sort();
  const dupes = [...groups.values()].filter((s) => s.length > 1).sort((a, b) => b.length - a.length);
  return { canonical, shadowed, dupes, groups, temporalOnlyByClaim };
}

// --------------------------------------------------------------------------

function makeFetchers(base, key) {
  const root = String(base || '').replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  async function fetchAll(table, select) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${root}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${offset}`, {
        headers,
      });
      if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
      const page = await res.json();
      if (!Array.isArray(page)) throw new Error(`${table}: ${JSON.stringify(page).slice(0, 200)}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  }

  /**
   * Runs the component's own query and returns the matching ids (capped at 12,
   * as the component caps) plus the exact total behind that cap.
   */
  async function runRendered(table, params) {
    params.set('limit', '12');
    // One flaky request must not abort a 244-request audit and leave a partial
    // report that reads like a finding. Retried twice, then reported as an error
    // on that row rather than swallowed.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${root}/rest/v1/${table}?${params}`, {
          headers: { ...headers, Prefer: 'count=exact' },
        });
        if (!res.ok) return { ids: [], total: 0, error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
        const body = await res.json();
        // fetchAll guards its response with Array.isArray and this did not, which
        // the first type-checked run of scripts/ caught: `body.map` on `unknown`.
        // A 200 carrying a non-array body would have thrown inside the retry
        // loop and been reported as "fetch failed: TypeError ... is not a
        // function" after three attempts - a network error message for a shape
        // problem, on the path that decides what reaches a sitemap.
        if (!Array.isArray(body)) {
          return { ids: [], total: 0, error: `unexpected body: ${JSON.stringify(body).slice(0, 120)}` };
        }
        const range = res.headers.get('content-range') || '';
        const total = Number(range.split('/')[1]);
        return { ids: body.map((r) => r.id), total: Number.isFinite(total) ? total : body.length };
      } catch (err) {
        if (attempt === 2) return { ids: [], total: 0, error: `fetch failed: ${String(err).slice(0, 120)}` };
      }
    }
    return { ids: [], total: 0, error: 'unreachable' };
  }

  return { fetchAll, runRendered };
}

/**
 * Measures every published pSEO page against its own listing query.
 *
 * `withAttainable` also pulls the three content tables so the caller can tell
 * "no inventory" from "inventory exists but the filter cannot address it". The
 * sitemap does not need that distinction and skips three full table reads by
 * leaving it off; the report does need it, because the two have different fixes.
 *
 * `errors` is returned rather than folded into the counts on purpose. A page
 * whose query failed reads as rendered 0, which is indistinguishable from a page
 * with no inventory - so a caller that is about to ACT on a shrunken set (the
 * sitemap) must be able to see that the shrink might be a network fault.
 */
export async function computePseoShippable({ base, key, now = new Date(), withAttainable = false }) {
  if (!base || !key) {
    throw new Error('computePseoShippable needs a Supabase URL and anon key.');
  }
  const { fetchAll, runRendered } = makeFetchers(base, key);
  const nowIso = now.toISOString();

  const pages = (await fetchAll('pseo_pages', 'id,slug,page_type_id,dimensions,is_published,updated_at,published_at')).filter(
    (p) => p.is_published,
  );

  const data = withAttainable
    ? {
        events: await fetchAll('events', 'id,title,date,location,venue,category,is_hidden'),
        restaurants: await fetchAll('restaurants', 'id,name,location,city,cuisine'),
        attractions: await fetchAll('attractions', 'id,name,location,address,type'),
      }
    : null;

  // Which slugs another route already answers. Read from src/App.tsx, so this
  // needs no network and cannot disagree with the AC7 collision audit.
  const claims = classifySlugs(
    pages.map((p) => p.slug),
    {
      appPath: path.join(REPO_ROOT, 'src', 'App.tsx'),
      redirectsPath: path.join(REPO_ROOT, 'public', '_redirects'),
    },
  );

  const results = [];
  for (const page of pages) {
    const dims = Object.fromEntries((page.dimensions || []).map((d) => [d.dimension, d]));
    const entityType = resolveEntityType(dims.content_type?.slug, dims.category?.slug);
    const [table, params] = renderedQuery(entityType, dims, nowIso);
    const rendered = table ? await runRendered(table, params) : { ids: [], total: 0 };
    const att = data ? attainable(entityType, dims, data, now) : null;

    const narrowing = Object.keys(dims).filter((k) => k !== 'content_type');
    const unfilterable = narrowing.length > 0 && narrowing.every((k) => k === 'audience');

    results.push({
      slug: page.slug,
      entityType,
      hasTemporal: Boolean(dims.temporal),
      rendered: rendered.total,
      error: rendered.error,
      attainable: att ? att.length : null,
      fingerprint: rendered.ids.slice().sort().join('|'),
      unfilterable,
      claimed: claims.claimed.has(page.slug),
      passes: rendered.total >= FLOOR[entityType],
      attainablePasses: att ? att.length >= FLOOR[entityType] : null,
    });
  }

  const { canonical, shadowed, dupes, temporalOnlyByClaim } = selectCanonical(results);

  return {
    now,
    pages,
    data,
    results,
    claims,
    canonical,
    shadowed,
    dupes,
    temporalOnlyByClaim,
    errors: results.filter((r) => r.error).length,
  };
}
