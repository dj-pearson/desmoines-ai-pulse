import type { Page, Route } from '@playwright/test';

/**
 * A PostgREST-shaped backend made of fixtures (WEB-CI-028 AC2).
 *
 * WHY THIS EXISTS. The smoke lane builds with placeholder VITE_SUPABASE_*, so
 * every query fails and no list page ever shows a row. Three specs -
 * search-filters, url-filter-state and sticky-filter-chips - were written,
 * committed, and then run by no workflow, and the reason the last four passes
 * could not wire them up was always the same seven tests: they assert on
 * RESULTS. A removable chip, a visible result count, a list that changes when
 * you type. None of that can happen against a backend that answers nothing.
 *
 * The note on those passes said they "need a preview deploy with a live
 * backend". They do not. They need ROWS, and rows are twenty lines of
 * page.route. What a live backend would add is coverage of the backend, which
 * is not what a filter-chip spec is for - and backend-down.spec.ts already
 * covers the unreachable case on purpose.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It is not a PostgREST emulator. It does
 * not parse `or=(...)`, it does not apply `ilike`, and it does not sort. Every
 * request for a table gets that table's rows. The specs using it asserts that
 * the UI reacts - the URL carries the query, the chip renders, a count appears,
 * the list re-renders - not that filtering returns the right subset, which is
 * a query-level question and belongs in a unit test over the query builder.
 * A fake that pretends to filter would let a broken filter pass.
 */

const ISO = '2026-01-01T00:00:00Z';

/**
 * One row per kind carries "Jazz" in its name.
 *
 * sticky-filter-chips loads each page with ?q=jazz and asserts a removable chip
 * renders. /restaurants filters its list CLIENT-side, so with no matching row
 * the page takes its empty-results branch - where the chips are not rendered -
 * and the spec fails on a page that is behaving correctly. /events filters
 * server-side, so it never noticed. Naming a match makes the scenario the spec
 * describes (a search WITH results) the one it actually runs.
 */
const MATCH = 'Jazz';

/** Enough distinct titles that a changed list is observably changed. */
function events(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    id: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: i === 0 ? `${MATCH} Night at the Fixture` : `Fixture Event ${i}`,
    description: 'An event supplied by tests/support/fixtureBackend.',
    category: i % 2 === 0 ? 'Music' : 'Food',
    date: '2026-10-01',
    event_start_utc: '2026-10-01T19:00:00Z',
    start_time: '19:00:00',
    end_time: null,
    location: 'Des Moines',
    venue: `Fixture Venue ${i}`,
    city: 'Des Moines',
    state: 'IA',
    address: `${100 + i} Locust St`,
    image_url: null,
    price: i % 3 === 0 ? 'Free' : '$15',
    is_featured: i < 2,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
  }));
}

/**
 * EVERY column in RESTAURANT_LIST_COLUMNS, because a missing one is a crash
 * rather than a blank. useRestaurants threw "Cannot read properties of
 * undefined" on a row that omitted them, and the page rendered its error state
 * - which from the outside is indistinguishable from the backend being down,
 * and cost half an iteration to tell apart. A fixture row has to be the shape
 * the projection asks for, not the shape the assertions read.
 */
function restaurants(n = 12) {
  return Array.from({ length: n }, (_, i) => restaurantRow(i));
}

function restaurantRow(i: number) {
  return {
    id: `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: i === 0 ? `${MATCH} Kitchen` : `Fixture Restaurant ${i}`,
    description: 'A restaurant supplied by tests/support/fixtureBackend.',
    cuisine: i % 2 === 0 ? 'American' : 'Italian',
    price_range: '$$',
    address: `${200 + i} Grand Ave`,
    city: 'Des Moines',
    state: 'IA',
    image_url: null,
    rating: 4.4,
    slug: `fixture-restaurant-${i}`,
    is_featured: i < 2,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
    data_quality_score: 80,
    enhanced: false,
    google_place_id: null,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    location: 'Des Moines',
    merged_at: null,
    merged_into: null,
    opening: false,
    opening_date: null,
    opening_timeframe: null,
    phone: '515-555-0100',
    popularity_score: 50,
    source_url: 'https://example.com/fixture',
    status: 'active',
    website: 'https://example.com/fixture',
    writeup_generated_at: null,
  };
}

function attractions(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    id: `30000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: i === 0 ? `${MATCH} Museum` : `Fixture Attraction ${i}`,
    description: 'An attraction supplied by tests/support/fixtureBackend.',
    type: i % 2 === 0 ? 'Museum' : 'Park',
    category: null,
    location: 'Des Moines',
    city: 'Des Moines',
    image_url: null,
    rating: 4.2,
    is_featured: i < 2,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
  }));
}

const TABLES: Record<string, () => unknown[]> = {
  events,
  restaurants,
  attractions,
  playgrounds: () => [],
  articles: () => [],
};

/**
 * RPCs that stand in for a table read, and which table's rows they return.
 *
 * MEASURED, NOT GUESSED. /restaurants reads its list through
 * rpc/get_rotated_restaurants, not from the restaurants table, so a fixture
 * that only answers table reads leaves that page on its empty state with the
 * search input correctly pre-filled - which looks exactly like the chip bug
 * the spec is hunting. The request log is the only way to tell those apart.
 */
const RPC_TABLES: Record<string, { table: string; wrap?: (row: unknown, total: number) => unknown }> = {
  // NOT bare rows. This RPC returns { restaurant_data, total_count } per row
  // and useRestaurants does rpcData.map((r) => r.restaurant_data). Handing it
  // bare restaurants produced a list of undefined and a crash inside
  // deprioritizeUnvisitable, which the page reported as "Something went wrong"
  // - indistinguishable from an outage, and the reason this took a while to
  // tell apart from a real defect. The shape of an RPC's RETURN is part of the
  // contract a fixture has to honour.
  get_rotated_restaurants: {
    table: 'restaurants',
    wrap: (row, total) => ({ restaurant_data: row, total_count: total }),
  },
};

/** The table name out of /rest/v1/<table>?... */
function tableOf(url: string): string | null {
  const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url);
  return m ? m[1] : null;
}

function fulfil(route: Route, body: unknown, total: number) {
  const headers = {
    'access-control-allow-origin': '*',
    // supabase-js reads the count off this header when the caller asked for
    // one. Without it every "N results" label renders null and the count
    // assertions fail for a reason that has nothing to do with the UI.
    'content-range': total > 0 ? `0-${total - 1}/${total}` : `*/0`,
  };

  // A COUNT-ONLY QUERY IS A HEAD REQUEST, and answering it with a body is not
  // a harmless extra. useRestaurants asks for `{ count: 'exact', head: true }`;
  // given a body, supabase-js threw "Cannot read properties of undefined
  // (reading 'status')" and the page rendered "Something went wrong" - which
  // looks exactly like an unreachable backend and is nothing like one.
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

export interface FixtureBackendOptions {
  /**
   * Pretend the restaurants collection has this many rows (restaurants-hub
   * spec: 478, so the hub has 16 pages). Rows are generated on demand and the
   * request's own window is honoured - `limit_count`/`offset_count` in the
   * get_rotated_restaurants body, `limit`/`offset` on a table read - so page 2
   * really is rows 31-60 and every id on a page is distinct. This is paging,
   * not filtering: the header above still holds, and a cuisine or search
   * parameter changes nothing about which rows come back.
   */
  restaurantTotal?: number;
}

/** Rows [offset, offset + limit) of a collection of `total`, generated on demand. */
function restaurantWindow(total: number, offset: number, limit: number) {
  const start = Math.max(0, Math.min(offset, total));
  const end = Math.max(start, Math.min(start + Math.max(0, limit), total));
  return Array.from({ length: end - start }, (_, k) => restaurantRow(start + k));
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** The limit/offset window a PostgREST table read asked for. */
function tableWindow(url: string, total: number): { offset: number; limit: number } {
  const params = new URL(url).searchParams;
  const offset = numberOr(params.get('offset'), 0);
  return { offset, limit: numberOr(params.get('limit'), total - offset) };
}

/** The window an RPC POST body asked for (get_rotated_restaurants' argument names). */
function rpcWindow(route: Route, total: number): { offset: number; limit: number } {
  let body: Record<string, unknown> = {};
  try {
    body = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
  } catch {
    body = {};
  }
  const offset = numberOr(body.offset_count, 0);
  return { offset, limit: numberOr(body.limit_count, total - offset) };
}

/**
 * Answer this page's Supabase traffic from fixtures. Call it BEFORE goto.
 *
 * Registration order matters in Playwright: the most recently registered
 * handler wins, so a caller that wants to override one table registers its own
 * route AFTER this. Learned the hard way in subscription-checkout.spec.ts,
 * where a catch-all added last swallowed the specific handler before it.
 */
export async function installFixtureBackend(
  page: Page,
  options: FixtureBackendOptions = {},
): Promise<void> {
  const { restaurantTotal } = options;

  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();

    // A single-row read (.single()/.maybeSingle()) sets Accept to the object
    // profile. Returning an array to one of those makes supabase-js report
    // PGRST116 and the page takes its not-found branch.
    const wantsObject = (route.request().headers()['accept'] || '').includes(
      'application/vnd.pgrst.object',
    );

    const table = tableOf(url);

    if (table === 'restaurants' && restaurantTotal !== undefined && !wantsObject) {
      const { offset, limit } = tableWindow(url, restaurantTotal);
      return fulfil(route, restaurantWindow(restaurantTotal, offset, limit), restaurantTotal);
    }

    const rows = table && TABLES[table] ? TABLES[table]() : [];

    if (wantsObject) {
      return rows.length > 0
        ? fulfil(route, rows[0], 1)
        : route.fulfill({
            status: 406,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
          });
    }

    return fulfil(route, rows, rows.length);
  });

  // RPCs. Registered AFTER the table route on purpose - Playwright gives the
  // most recently registered handler the match, so this one wins for /rpc/
  // paths. An RPC that stands in for a table read returns that table's rows;
  // everything else answers empty rather than failing, so a page that calls one
  // does not fall into an error branch the spec is not about.
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = /\/rest\/v1\/rpc\/([a-z0-9_]+)/i.exec(route.request().url())?.[1] ?? '';
    const spec = RPC_TABLES[fn];
    if (spec?.table === 'restaurants' && restaurantTotal !== undefined) {
      const { offset, limit } = rpcWindow(route, restaurantTotal);
      const rows = restaurantWindow(restaurantTotal, offset, limit);
      const body = spec.wrap ? rows.map((row) => spec.wrap!(row, restaurantTotal)) : rows;
      return fulfil(route, body, restaurantTotal);
    }
    const rows = spec ? TABLES[spec.table]() : [];
    const body = spec?.wrap ? rows.map((row) => spec.wrap!(row, rows.length)) : rows;
    return fulfil(route, body, rows.length);
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({}),
    }),
  );
}
