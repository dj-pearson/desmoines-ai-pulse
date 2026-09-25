import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The first view of `/` (docs/page-plans/home-pass2.md WP1 items 4, 10, 14).
 *
 * 1. An anonymous load with no scroll makes 4 or fewer Supabase requests and
 *    no nlp-search call. It was 6: the hero's desktop tiles cost two counts
 *    (restaurants, new this week) that are gone with the tiles, and
 *    LazySection keeps everything below the rails from mounting until it is
 *    near the viewport.
 * 2. At 390x844 and 1366x768 the search input and at least one Tonight card
 *    link are inside the first viewport. At 1366x768 the hero used to run to
 *    793px, so no card showed.
 *
 * Runs against the fixture backend, so every query succeeds and nothing
 * retries: one query is one request. Preflights are not counted. Consent is
 * seeded so the banner does not cover the cards.
 */

const MAX_REQUESTS = 4;

const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

function seedConsent(page: Page) {
  return page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode: the assertions fail, not this */
    }
  }, CONSENT);
}

/**
 * Answer the hero's count (a HEAD request) with a count the browser can read.
 *
 * supabase-js takes the count from Content-Range, and on a cross-origin
 * response the browser only exposes that header when the server lists it in
 * Access-Control-Expose-Headers, as PostgREST does. The shared fixture backend
 * sets the range without exposing it, so the count arrives as null; the hook
 * rightly treats that as a failure and retries, which would count here as three
 * requests for one query.
 */
function answerCounts(page: Page) {
  return page.route('**/rest/v1/events?**', (route) => {
    if (route.request().method() !== 'HEAD') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': '0-2/3',
      },
      body: '',
    });
  });
}

async function countFirstView(page: Page) {
  const counts = new Map<string, number>();
  page.on('request', (req) => {
    if (req.method() === 'OPTIONS') return;
    const m = req.url().match(/\/(rest|functions)\/v1\/(?:rpc\/)?([^?/]+)/);
    if (!m) return;
    const key = m[2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  await seedConsent(page);
  await installFixtureBackend(page);
  await answerCounts(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('search')).toBeVisible({ timeout: 30_000 });
  // Long enough for every first-view query to have fired; no scrolling.
  await page.waitForTimeout(6_000);
  return counts;
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1366, height: 768 },
];

for (const vp of VIEWPORTS) {
  test(`anonymous first view of / stays within ${MAX_REQUESTS} Supabase requests (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const counts = await countFirstView(page);

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const detail = [...counts.entries()].map(([k, n]) => `${k} x${n}`).join(', ');

    expect(counts.get('nlp-search') ?? 0, `nlp-search called on first view: ${detail}`).toBe(0);
    expect(counts.get('get_trending_events') ?? 0, `get_trending_events called more than once: ${detail}`).toBeLessThanOrEqual(1);
    expect(total, `first view made ${total} Supabase requests: ${detail}`).toBeLessThanOrEqual(MAX_REQUESTS);
  });
}

// --- First viewport -------------------------------------------------------
//
// The clock is pinned to 18:00 CDT and the events and restaurants tables are
// answered with three shows later this evening, so the Tonight rail has cards
// at any real time of day. Registered after the fixture backend, so they win.

const NOW = new Date('2026-09-24T23:00:00Z'); // 18:00 CDT, a Thursday
const ISO = '2026-09-01T00:00:00Z';

function tonightEvent(i: number, startUtc: string) {
  return {
    id: `41000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Evening Show ${i}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    date: startUtc,
    end_date: null,
    enhanced_description: null,
    event_start_local: null,
    event_start_utc: startUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5875 + i * 0.001,
    location: 'Des Moines',
    longitude: -93.6235,
    original_description: 'A fixture event for the first-viewport check.',
    price: '$20',
    source_url: 'https://example.com/fixture',
    updated_at: ISO,
    venue: `Evening Venue ${i}`,
    writeup_generated_at: null,
  };
}

const EVENTS = [
  tonightEvent(0, '2026-09-25T00:00:00Z'), // 19:00 CDT
  tonightEvent(1, '2026-09-25T00:30:00Z'), // 19:30 CDT
  tonightEvent(2, '2026-09-25T01:00:00Z'), // 20:00 CDT
];

function rows(route: Route, body: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': body.length > 0 ? `0-${body.length - 1}/${body.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

for (const vp of VIEWPORTS) {
  test(`the search input and a Tonight card are in the first viewport (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.clock.setFixedTime(NOW);
    await seedConsent(page);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/events?**', (route) => rows(route, EVENTS));
    await page.route('**/rest/v1/restaurants?**', (route) => rows(route, []));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const input = page.getByRole('search').getByRole('searchbox');
    await expect(input).toBeInViewport({ timeout: 30_000 });

    const tonightLink = page.locator('a[data-tonight-link="event"]').first();
    await expect(tonightLink).toBeVisible({ timeout: 30_000 });
    await expect(tonightLink).toBeInViewport();
  });
}
