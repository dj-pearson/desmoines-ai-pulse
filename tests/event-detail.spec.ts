import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Event detail (docs/page-plans/events.md WP8, docs/page-plans/events-pass2.md
 * WP4).
 *
 *   - A backend failure is not a 404: the page offers Retry and publishes no
 *     robots noindex, so an outage cannot drop live events from the index.
 *   - /events/<uuid>, which push taps, favorites and emails still build, lands
 *     on the canonical /events/<title>-<yyyy-mm-dd> URL.
 *   - A dateless slug, which reminder and digest emails build, resolves.
 *   - A merged duplicate redirects to its survivor.
 *   - A row with no published start time publishes a date-only startDate.
 *   - The outbound button names where it goes, and a javascript: source gets
 *     none.
 *   - head meta comes from the row: a Waukee event is not placed downtown.
 *   - A past event offers no hotels.
 *
 * The clock is fixed at Fri 2026-09-25 12:00 CDT with page.clock, so "upcoming"
 * and "over" don't depend on the day this runs.
 *
 * Runs in no CI lane yet (WEB-CI-028): the integrator lists it in
 * playwright.smoke.config.ts. Run it by hand with
 *   PLAYWRIGHT_CHROMIUM_PATH=... npx playwright test -c playwright.smoke.config.ts \
 *     tests/event-detail.spec.ts --project=chromium-desktop
 *
 * WHY THIS SPEC FILTERS. tests/support/fixtureBackend.ts answers every events
 * read with the same rows on purpose. Slug resolution is a question of which
 * row a query returns, so the events table here is served by `serveEvents`,
 * which applies the handful of predicates the detail lookup sends (id, title,
 * date window, the visibility flags) and nothing else. Everything else still
 * comes from installFixtureBackend.
 */

const NOW = new Date('2026-09-25T17:00:00Z');

type Row = Record<string, unknown>;

function row(over: Row): Row {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'Untitled',
    category: 'Music',
    city: 'Des Moines',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    date: '2026-10-01T00:00:00Z',
    end_date: null,
    enhanced_description: null,
    original_description: 'A fixture event for tests/event-detail.spec.ts.',
    event_start_local: null,
    event_start_utc: '2026-10-01T00:00:00Z',
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5868,
    longitude: -93.625,
    location: 'Des Moines, IA',
    price: '$25',
    source_url: null,
    venue: 'Fixture Hall',
    writeup_generated_at: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    seo_h1: null,
    geo_summary: null,
    geo_key_facts: null,
    geo_faq: null,
    ai_writeup: null,
    writeup_prompt_used: null,
    source_url_broken: false,
    source_url_checked_at: null,
    recurrence_parent_id: null,
    merged_into: null,
    is_recurring_instance: false,
    is_merged: false,
    is_hidden: false,
    archived_at: null,
    ...over,
  };
}

/** 7:00 PM CDT Thu Oct 1: "jazz-night-2026-10-01". */
const JAZZ = row({
  id: '40000000-0000-0000-0000-000000000001',
  title: 'Jazz Night',
  date: '2026-10-02T00:00:00Z',
  event_start_utc: '2026-10-02T00:00:00Z',
});

/** The uuid redirect fixture the first pass wrote, kept. */
const FIXTURE_JAZZ = row({
  id: '20000000-0000-0000-0000-000000000000',
  title: 'Jazz Night at the Fixture',
  date: '2026-10-01T19:00:00Z',
  event_start_utc: '2026-10-01T19:00:00Z',
  price: 'Free',
});

/** No published time: the 19:31:58 marker, Wed Oct 7 Central. */
const SENTINEL = row({
  id: '40000000-0000-0000-0000-000000000002',
  title: 'Harvest Supper',
  date: '2026-10-08T00:31:58+00:00',
  event_start_utc: '2026-10-08T00:31:58+00:00',
  event_start_local: '2026-10-07T19:31:58',
});

const LISTING = row({
  id: '40000000-0000-0000-0000-000000000003',
  title: 'Gallery Walk',
  date: '2026-10-03T00:00:00Z',
  event_start_utc: '2026-10-03T00:00:00Z',
  price: 'Varies',
  source_url: 'https://www.catchdesmoines.com/event/gallery-walk/12345/',
});

const SCRIPTED = row({
  id: '40000000-0000-0000-0000-000000000004',
  title: 'Script Night',
  date: '2026-10-04T00:00:00Z',
  event_start_utc: '2026-10-04T00:00:00Z',
  source_url: 'javascript:alert(1)',
});

const WAUKEE = row({
  id: '40000000-0000-0000-0000-000000000005',
  title: 'Waukee Trivia',
  date: '2026-10-06T00:00:00Z',
  event_start_utc: '2026-10-06T00:00:00Z',
  city: 'Waukee',
  location: 'Waukee, IA',
  venue: "Mickey's Irish Pub",
  latitude: 41.6116,
  longitude: -93.8852,
});

const SURVIVOR = row({
  id: '40000000-0000-0000-0000-000000000006',
  title: 'Blues on the River',
  date: '2026-10-10T00:00:00Z',
  event_start_utc: '2026-10-10T00:00:00Z',
});

/**
 * Merged into SURVIVOR. The title shares no word with it, so the stale-slug
 * rescue can't land on the survivor by itself; only the merge pointer can.
 */
const DUPLICATE = row({
  id: '40000000-0000-0000-0000-000000000007',
  title: 'Delta Sounds Evening',
  date: '2026-10-10T00:00:00Z',
  event_start_utc: '2026-10-10T00:00:00Z',
  is_merged: true,
  merged_into: SURVIVOR.id,
});

/** Over by the fixed clock: Tue Sep 1. */
const PAST = row({
  id: '40000000-0000-0000-0000-000000000008',
  title: 'Summer Send Off',
  date: '2026-09-02T00:00:00Z',
  event_start_utc: '2026-09-02T00:00:00Z',
});

const ROWS = [JAZZ, FIXTURE_JAZZ, SENTINEL, LISTING, SCRIPTED, WAUKEE, SURVIVOR, DUPLICATE, PAST];

/** PostgREST `ilike` with % wildcards, case-insensitive. */
function ilike(value: unknown, pattern: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split(/[%*]/)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  );
  return re.test(String(value ?? ''));
}

function ms(value: unknown): number {
  return Date.parse(String(value));
}

/** Apply the filters the detail page's reads send; ignore the rest. */
function matches(r: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params.entries()) {
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (key === 'or') {
      // The unlisted second look (useEventBySlug): merged or archived rows only.
      if (raw === '(is_merged.eq.true,archived_at.not.is.null)') {
        if (r.is_merged === true || (r.archived_at !== null && r.archived_at !== undefined)) continue;
        return false;
      }
      return false; // series by parent: none in these fixtures
    }
    const cell = r[key];
    if (op === 'eq' && String(cell) !== val) return false;
    if (op === 'neq' && String(cell) === val) return false;
    if (op === 'is' && val === 'null' && cell !== null && cell !== undefined) return false;
    if (op === 'not' && val === 'is.null' && (cell === null || cell === undefined)) return false;
    if (op === 'ilike' && !ilike(cell, val)) return false;
    if (op === 'gte' && key === 'date' && !(ms(cell) >= ms(val))) return false;
    if (op === 'gt' && key === 'date' && !(ms(cell) > ms(val))) return false;
    if (op === 'lt' && key === 'date' && !(ms(cell) < ms(val))) return false;
    if (op === 'lte' && key === 'date' && !(ms(cell) <= ms(val))) return false;
  }
  return true;
}

function answer(route: Route, rows: Row[]) {
  const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (wantsObject) {
    return rows.length === 1
      ? route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows[0]) })
      : route.fulfill({
          status: 406,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
        });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function serveEvents(page: Page) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events?**', (route) => {
    if (route.request().method() === 'HEAD') return answer(route, []);
    const params = new URL(route.request().url()).searchParams;
    const limit = Number(params.get('limit') ?? Infinity);
    const found = ROWS.filter((r) => matches(r, params)).sort((a, b) => ms(a.date) - ms(b.date));
    return answer(route, found.slice(0, limit));
  });
}

async function openAt(page: Page, path: string) {
  await page.clock.setFixedTime(NOW);
  await serveEvents(page);
  await page.goto(path);
}

async function eventJsonLd(page: Page): Promise<Record<string, unknown>> {
  await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached({ timeout: 30_000 });
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  for (const text of blocks) {
    const node = JSON.parse(text) as Record<string, unknown>;
    if (node['@type'] === 'Event') return node;
  }
  throw new Error('no Event JSON-LD on the page');
}

async function cutTheBackend(page: Page) {
  await page.route('**://*.supabase.co/**', (route) => route.abort('failed'));
  await page.route('**/rest/v1/**', (route) => route.abort('failed'));
  await page.route('**/functions/v1/**', (route) => route.abort('failed'));
}

test.describe('event detail', () => {
  test('backend down: Retry, no noindex', async ({ page }) => {
    await cutTheBackend(page);
    await page.goto('/events/jazz-night-at-the-fixture-2026-10-01');

    await expect(page.getByRole('heading', { name: /couldn't load this event/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(page.getByText('Event Not Found')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test('a UUID link redirects to the canonical slug', async ({ page }) => {
    await openAt(page, `/events/${FIXTURE_JAZZ.id}`);

    await expect(page).toHaveURL(/\/events\/jazz-night-at-the-fixture-2026-10-01$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: /Jazz Night at the Fixture/ })).toBeVisible();
  });

  test('a dateless slug redirects to the dated one', async ({ page }) => {
    await openAt(page, '/events/jazz-night');

    await expect(page).toHaveURL(/\/events\/jazz-night-2026-10-01$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Jazz Night' })).toBeVisible();
  });

  test('a merged duplicate redirects to its survivor', async ({ page }) => {
    await openAt(page, '/events/delta-sounds-evening-2026-10-09');

    await expect(page).toHaveURL(/\/events\/blues-on-the-river-2026-10-09$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Blues on the River' })).toBeVisible();
  });

  test('an untimed row publishes a date-only startDate and says so', async ({ page }) => {
    await openAt(page, '/events/harvest-supper-2026-10-07');

    await expect(page.getByRole('heading', { level: 1, name: 'Harvest Supper' })).toBeVisible({ timeout: 30_000 });
    const node = await eventJsonLd(page);
    expect(String(node.startDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(node.startDate).toBe('2026-10-07');
    expect(node).not.toHaveProperty('endDate');
    await expect(page.getByText('Time not listed')).toBeVisible();
    await expect(page.getByText("The source didn't publish a start time")).toBeVisible();
    await expect(page.getByText(/7:31 PM/)).toHaveCount(0);
  });

  test('a Varies price on a listing site names the host, not tickets', async ({ page }) => {
    await openAt(page, '/events/gallery-walk-2026-10-02');

    // By role and name: the production build strips data-testid (vite.config.ts).
    await expect(page.getByRole('link', { name: /^Event listing on catchdesmoines\.com/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Get tickets')).toHaveCount(0);
  });

  test('a javascript: source gets no outbound button', async ({ page }) => {
    await openAt(page, '/events/script-night-2026-10-03');

    await expect(page.getByRole('heading', { level: 1, name: 'Script Night' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /^(Get tickets|Event listing on)/ })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('a Waukee event is not placed downtown in head meta', async ({ page }) => {
    await openAt(page, '/events/waukee-trivia-2026-10-05');

    await expect(page.getByRole('heading', { level: 1, name: 'Waukee Trivia' })).toBeVisible({ timeout: 30_000 });
    // [data-rh] is the page's own tag. index.html used to ship a static
    // downtown geo.position that Helmet never replaced, so the page carried
    // both; no tag on the page may say downtown now.
    await expect(page.locator('meta[name="geo.position"][data-rh]')).toHaveAttribute('content', '41.6116;-93.8852');
    await expect(page.locator('meta[name="geo.position"]')).toHaveCount(1);
    await expect(page.locator('meta[name="ICBM"][content="41.5868, -93.6250"]')).toHaveCount(0);
    await expect(page.locator('meta[name="geo.placename"][data-rh]')).toHaveAttribute('content', /^Waukee, /);
    await expect(page.locator('meta[name="event:city"]')).toHaveAttribute('content', 'Waukee');
  });

  test('a past event offers no hotels and says it took place', async ({ page }) => {
    await openAt(page, '/events/summer-send-off-2026-09-01');

    await expect(page.getByRole('heading', { level: 1, name: 'Summer Send Off' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#event-summary')).toContainText('took place');
    await expect(page.getByText(/Stay Nearby|Staying over\?|hotels near/i)).toHaveCount(0);
  });

  test('the article passes axe', async ({ page }) => {
    await openAt(page, '/events/jazz-night-2026-10-01');
    await expect(page.getByRole('heading', { level: 1, name: 'Jazz Night' })).toBeVisible({ timeout: 30_000 });

    const results = await new AxeBuilder({ page })
      .include('article')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
