import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay WP1: the free date-window planner on /trip-planner
 * (docs/page-plans/plan-stay.md).
 *
 * 1. Signed out at 390x844, the first viewport holds the h1, both dates and
 *    the primary button.
 * 2. ?from=2026-10-09&to=2026-10-11 restores the window: events listed under
 *    their Central day, at least three hotels nearest-first with a
 *    straight-line label, and a "See all" link into /stay?near=.
 * 3. The page makes no auth, subscription or trip-storage request, and with
 *    AI_PLANNER_AVAILABLE=false no Generate, Share or My Trips control renders.
 *
 * Events, hotels and venues are answered here, registered AFTER
 * installFixtureBackend so these handlers win. The events handler does not
 * filter by the date bounds on purpose: the grouping by Central day is what's
 * under test, and every fixture row is inside the window. The planner makes
 * two events reads (rows starting in the window, and rows still running from
 * before it, which carry `end_date=gte`); the second gets no rows here.
 *
 * The clock is pinned (plan-stay-pass2 WP1 item 3): the planner refuses a
 * window that has ended, and these fixtures are dated Oct 9-11, 2026.
 */

const NOW = new Date('2026-10-01T17:00:00Z');

const ISO = '2026-09-01T12:00:00.000Z';
const ARENA = { latitude: 41.5908, longitude: -93.6208 };

function event(i: number, dateUtc: string, extra: Record<string, unknown> = {}) {
  return {
    id: `51000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Window Fixture Event ${i}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    updated_at: ISO,
    date: dateUtc,
    end_date: null,
    enhanced_description: null,
    original_description: 'An event supplied by trip-planner-window.spec.ts.',
    event_start_local: null,
    event_start_utc: dateUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: ARENA.latitude,
    longitude: ARENA.longitude,
    location: 'Wells Fargo Arena, Des Moines',
    venue: 'Wells Fargo Arena',
    price: 'Free',
    source_url: null,
    writeup_generated_at: null,
    ...extra,
  };
}

// 6 PM CDT Friday Oct 9 is 23:00Z; 11:30 PM CDT Saturday is 04:30Z Sunday,
// which a UTC-date grouper would file under Sunday.
const EVENTS = [
  event(1, '2026-10-09T23:00:00+00:00'),
  event(2, '2026-10-11T04:30:00+00:00'),
  event(3, '2026-10-11T18:00:00+00:00', { latitude: null, longitude: null }),
];

function hotelPin(i: number, milesNorth: number) {
  return {
    id: `52000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Window Fixture Hotel ${i}`,
    slug: `window-fixture-hotel-${i}`,
    city: 'Des Moines',
    // One degree of latitude is about 69 miles.
    latitude: ARENA.latitude + milesNorth / 69,
    longitude: ARENA.longitude,
  };
}

// Deliberately out of distance order.
const HOTELS = [hotelPin(1, 3.0), hotelPin(2, 0.4), hotelPin(3, 8.0), hotelPin(4, 1.2), hotelPin(5, 5.0), hotelPin(6, 12.0)];

const VENUES = [
  {
    id: '53000000-0000-0000-0000-000000000001',
    name: 'Wells Fargo Arena',
    slug: 'wells-fargo-arena',
    address: '233 Center St, Des Moines, IA 50309',
    latitude: ARENA.latitude,
    longitude: ARENA.longitude,
  },
];

function reply(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

/**
 * The cookie banner is fixed to the bottom of the viewport at z-[60] and sits
 * over the "Show what's on" button. A stored decision keeps it closed;
 * cookie-consent.spec.ts covers the banner itself (same seed as
 * restaurants-hub.spec.ts).
 */
async function seedConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
}

async function installWindow(page: Page): Promise<string[]> {
  await page.clock.setFixedTime(NOW);
  await seedConsent(page);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events**', (route) =>
    reply(route, /end_date=gte/.test(route.request().url()) ? [] : EVENTS),
  );
  await page.route('**/rest/v1/hotels**', (route) => reply(route, HOTELS));
  await page.route('**/rest/v1/venues**', (route) => reply(route, VENUES));

  const forbidden: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      /\/auth\/v1\/(user|token)/.test(url) ||
      /\/rest\/v1\/(subscription_plans|user_subscriptions|trip_plans|trip_plan_items)/.test(url) ||
      /\/functions\/v1\/generate-itinerary/.test(url)
    ) {
      forbidden.push(`${req.method()} ${url}`);
    }
  });
  return forbidden;
}

/** The Central-day headings inside the events section only (the footer and FAQ have h3s too). */
function dayHeadings(page: Page) {
  return page.locator('section[aria-labelledby="trip-events-heading"]').getByRole('heading', { level: 3 });
}

test.describe('/trip-planner date window', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('first viewport holds the h1, a date range and the primary button', async ({ page }) => {
    await installWindow(page);
    await page.goto('/trip-planner');

    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByLabel('Arriving')).toBeInViewport();
    await expect(page.getByLabel('Leaving')).toBeInViewport();
    await expect(page.getByRole('button', { name: "Show what's on" })).toBeInViewport();
  });

  test('?from=&to= restores the window with events by day and hotels nearest-first', async ({ page }) => {
    const forbidden = await installWindow(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');

    await expect(page.getByLabel('Arriving')).toHaveValue('2026-10-09');
    await expect(page.getByLabel('Leaving')).toHaveValue('2026-10-11');

    const days = dayHeadings(page);
    await expect(days).toHaveText(['Friday, October 9', 'Saturday, October 10', 'Sunday, October 11']);

    // Event 2 is 11:30 PM Saturday Central, 04:30 Sunday UTC.
    const events = page.locator('section[aria-labelledby="trip-events-heading"]');
    const saturday = events.locator('li', { has: page.getByRole('heading', { name: 'Saturday, October 10' }) });
    await expect(saturday.getByText('Window Fixture Event 2')).toBeVisible();
    const friday = events.locator('li', { has: page.getByRole('heading', { name: 'Friday, October 9' }) });
    await expect(friday.getByText('Window Fixture Event 1')).toBeVisible();

    const hotels = page.getByRole('list', { name: 'Hotels nearest these events' }).getByRole('link');
    await expect(hotels).toHaveCount(5);
    await expect(hotels.nth(0)).toContainText('Window Fixture Hotel 2');
    await expect(hotels.nth(1)).toContainText('Window Fixture Hotel 4');
    await expect(hotels.nth(2)).toContainText('Window Fixture Hotel 1');
    await expect(hotels.first()).toContainText('(straight line)');

    await expect(page.getByRole('link', { name: 'See all hotels near Wells Fargo Arena' })).toHaveAttribute(
      'href',
      '/stay?near=wells-fargo-arena',
    );
    await expect(page.getByRole('link', { name: 'How to get around Des Moines' })).toHaveAttribute('href', '/getting-around');

    await page.reload();
    await expect(page).toHaveURL(/from=2026-10-09&to=2026-10-11/);
    await expect(days.first()).toHaveText('Friday, October 9');

    expect(forbidden, 'no auth, subscription or trip-storage request').toEqual([]);
  });

  test('submitting new dates mirrors them into the URL', async ({ page }) => {
    await installWindow(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');
    await page.getByLabel('Arriving').fill('2026-10-10');
    await page.getByLabel('Leaving').fill('2026-10-10');
    await page.getByRole('button', { name: "Show what's on" }).click();
    await expect(page).toHaveURL(/from=2026-10-10&to=2026-10-10/);
    await expect(dayHeadings(page)).toHaveText(['Saturday, October 10']);
  });

  test('with the AI planner paused, no Generate, Share or My Trips control renders', async ({ page }) => {
    await installWindow(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');
    await expect(dayHeadings(page).first()).toBeVisible();

    await expect(page.getByText(/AI itineraries are paused/)).toBeVisible();
    await expect(page.getByRole('button', { name: /generate/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /share/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /my trips/i })).toHaveCount(0);
    await expect(page.getByText(/\$4\.99|\$12\.99/)).toHaveCount(0);
  });
});
