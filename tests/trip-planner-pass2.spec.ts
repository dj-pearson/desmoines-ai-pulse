import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay pass 2, WP1: the date window tells the truth at its edges and
 * keeps a free trip calendar (docs/page-plans/plan-stay-pass2.md).
 *
 * - A festival running Oct 9-11 is listed on Friday, Saturday and Sunday, and
 *   the later days say "Ongoing, through Oct 11" instead of a start time.
 * - A 14-day window whose 100 in-window rows run out on day 5 says where it
 *   stops and links "More on this day" for every later day.
 * - A stale ?from=2020-01-01&to=2020-01-03 renders the default window.
 * - Starring two events writes ?e=, survives a reload, and the .ics holds two
 *   VEVENTs in UTC.
 * - Five rows per day, then "Show all N on Friday"; focus lands on the window
 *   heading after "Show what's on"; dinner before an evening show; a failed
 *   events read doesn't claim the events have no location.
 *
 * The clock is pinned to Thu Oct 1, 2026, noon Central, so "this weekend" is
 * Oct 2-4 and the Oct 9 fixtures are in the future. Events, hotels, venues and
 * restaurants are answered here after installFixtureBackend, so these
 * handlers win. The planner makes two events reads: rows starting in the
 * window, and rows still running from before it (`end_date=gte`).
 */

const NOW = new Date('2026-10-01T17:00:00Z');
const ISO = '2026-09-01T12:00:00.000Z';
const ARENA = { latitude: 41.5908, longitude: -93.6208 };

let seq = 0;
function event(title: string, dateUtc: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `61000000-0000-0000-0000-${String(seq).padStart(12, '0')}`,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    updated_at: ISO,
    date: dateUtc,
    end_date: null,
    enhanced_description: null,
    original_description: 'An event supplied by trip-planner-pass2.spec.ts.',
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

// 5 PM CDT Friday Oct 9 to 10 PM CDT Sunday Oct 11.
const FESTIVAL = event('Pass2 Harvest Festival', '2026-10-09T22:00:00+00:00', { end_date: '2026-10-12T03:00:00+00:00' });
// 7:30 PM CDT Friday.
const SHOW = event('Pass2 Friday Show', '2026-10-10T00:30:00+00:00');
// Opened in March, runs to New Year's Eve: returned by the "still running" read.
const EXHIBIT = event('Pass2 Long Exhibit', '2026-03-01T16:00:00+00:00', { end_date: '2027-01-01T05:00:00+00:00' });

const HOTELS = [
  { id: '62000000-0000-0000-0000-000000000001', name: 'Pass2 Hotel Near', slug: 'pass2-hotel-near', city: 'Des Moines', latitude: ARENA.latitude + 0.3 / 69, longitude: ARENA.longitude },
  { id: '62000000-0000-0000-0000-000000000002', name: 'Pass2 Hotel Far', slug: 'pass2-hotel-far', city: 'Ames', latitude: ARENA.latitude + 30 / 69, longitude: ARENA.longitude },
];

const VENUES = [
  { slug: 'wells-fargo-arena', name: 'Wells Fargo Arena', address: '233 Center St, Des Moines, IA 50309', latitude: ARENA.latitude, longitude: ARENA.longitude, capacity: null },
];

const RESTAURANTS = [
  { id: '63000000-0000-0000-0000-000000000001', name: 'Pass2 Supper Club', slug: 'pass2-supper-club', cuisine: 'American', latitude: ARENA.latitude + 0.2 / 69, longitude: ARENA.longitude, opening: 'Daily 11am-10pm', opening_date: null, status: null },
  { id: '63000000-0000-0000-0000-000000000002', name: 'Pass2 Lunch Only', slug: 'pass2-lunch-only', cuisine: 'Deli', latitude: ARENA.latitude + 0.1 / 69, longitude: ARENA.longitude, opening: 'Daily 7am-2pm', opening_date: null, status: null },
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

interface Backend {
  inWindow?: unknown[];
  ongoing?: unknown[];
  eventsFail?: boolean;
}

async function install(page: Page, backend: Backend = {}) {
  await page.clock.setFixedTime(NOW);
  await seedConsent(page);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events**', (route) => {
    if (backend.eventsFail) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) });
    }
    const ongoing = /end_date=gte/.test(route.request().url());
    return reply(route, ongoing ? (backend.ongoing ?? []) : (backend.inWindow ?? [FESTIVAL, SHOW]));
  });
  await page.route('**/rest/v1/hotels**', (route) => reply(route, HOTELS));
  await page.route('**/rest/v1/venues**', (route) => reply(route, VENUES));
  await page.route('**/rest/v1/restaurants**', (route) => reply(route, RESTAURANTS));
}

const eventsSection = (page: Page) => page.locator('section[aria-labelledby="trip-events-heading"]');
const day = (page: Page, name: string) =>
  eventsSection(page).locator('ol > li', { has: page.getByRole('heading', { level: 3, name }) });

test.describe('/trip-planner pass 2', () => {
  test('a multi-day festival is on every day it runs, labelled ongoing after its first', async ({ page }) => {
    await install(page, { ongoing: [EXHIBIT] });
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');

    for (const name of ['Friday, October 9', 'Saturday, October 10', 'Sunday, October 11']) {
      await expect(day(page, name).getByText('Pass2 Harvest Festival')).toBeVisible();
      await expect(day(page, name).getByText('Pass2 Long Exhibit')).toBeVisible();
    }
    const friday = day(page, 'Friday, October 9');
    await expect(friday.locator('li', { hasText: 'Pass2 Harvest Festival' })).toContainText('5:00 PM');
    // The exhibit opened in March: no March clock time on day one.
    await expect(friday.locator('li', { hasText: 'Pass2 Long Exhibit' })).toContainText('Ongoing, through Dec 31');
    for (const name of ['Saturday, October 10', 'Sunday, October 11']) {
      const row = day(page, name).locator('li', { hasText: 'Pass2 Harvest Festival' });
      await expect(row).toContainText('Ongoing, through Oct 11');
      await expect(row).not.toContainText('5:00 PM');
    }
  });

  test('a cut window says where it stops and links the later days', async ({ page }) => {
    // 100 rows, 20 a day, Oct 9-13 (days 1-5 of 14), all at 6 PM CDT.
    const rows = Array.from({ length: 100 }, (_, i) => {
      const d = 9 + Math.floor(i / 20);
      return event(`Pass2 Busy ${i}`, `2026-10-${String(d).padStart(2, '0')}T23:00:00+00:00`);
    });
    await install(page, { inWindow: rows });
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-22');

    await expect(page.locator('[data-trip-window="summary"]')).toContainText('Showing through Tue, Oct 13');
    await expect(eventsSection(page).getByRole('heading', { level: 3 })).toHaveCount(14);
    await expect(eventsSection(page).getByText('Nothing listed yet.')).toHaveCount(0);
    for (let d = 14; d <= 22; d++) {
      const name = new Date(Date.UTC(2026, 9, d, 12)).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const link = day(page, name).getByRole('link', { name: /More on this day/ });
      await expect(link).toHaveAttribute('href', `/events?from=2026-10-${d}`);
    }

    // Five rows a day, then a button that says how many.
    const friday = day(page, 'Friday, October 9');
    await expect(friday.getByRole('link', { name: /Pass2 Busy/ })).toHaveCount(5);
    const more = friday.getByRole('button', { name: 'Show all 20 on Friday' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(friday.getByRole('link', { name: /Pass2 Busy/ })).toHaveCount(20);
    await expect(friday.getByRole('button', { name: 'Show fewer on Friday' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('a stale window falls back to the default and says so', async ({ page }) => {
    await install(page);
    await page.goto('/trip-planner?from=2020-01-01&to=2020-01-03');
    await expect(page.getByLabel('Arriving')).toHaveValue('2026-10-02');
    await expect(page.getByLabel('Leaving')).toHaveValue('2026-10-04');
    await expect(page.locator('[data-trip-window="notice"]')).toContainText('Those dates have passed');
    await expect(page.locator('#trip-events-heading')).not.toContainText('2020');

    // Typing a past window is refused in the form too.
    await page.getByLabel('Arriving').fill('2026-09-01');
    await page.getByLabel('Leaving').fill('2026-09-02');
    await page.getByRole('button', { name: "Show what's on" }).click();
    await expect(page.getByRole('alert')).toHaveText('Pick dates from today on.');
  });

  test('two starred events go into the URL, survive a reload and export as one .ics', async ({ page }) => {
    await install(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');

    const friday = day(page, 'Friday, October 9');
    await friday.getByRole('button', { name: 'Add Pass2 Friday Show to your trip calendar' }).click();
    await friday.getByRole('button', { name: 'Add Pass2 Harvest Festival to your trip calendar' }).click();
    await expect(page).toHaveURL(new RegExp(`e=${SHOW.id}%2C${FESTIVAL.id}|e=${SHOW.id},${FESTIVAL.id}`));
    await expect(friday.getByRole('button', { name: 'Add Pass2 Friday Show to your trip calendar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    const shortlist = page.locator('section[aria-labelledby="trip-shortlist-heading"]');
    await expect(shortlist).toContainText('2 events picked');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      shortlist.getByRole('button', { name: 'Add to calendar' }).click(),
    ]);
    const ics = readFileSync(await download.path(), 'utf8');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    // 7:30 PM CDT Friday is 00:30Z Saturday.
    expect(ics).toContain('DTSTART:20261010T003000Z');
    // The festival runs across days: all-day, clipped to the window.
    expect(ics).toContain('DTSTART;VALUE=DATE:20261009');
    expect(ics).toContain('DTEND;VALUE=DATE:20261012');

    // Coming back without ?e= restores the picks from storage.
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');
    await expect(page).toHaveURL(/e=/);
    await expect(shortlist).toContainText('2 events picked');
  });

  test('dinner before the evening show, and hotels near the venue', async ({ page }) => {
    await install(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');

    const pairing = day(page, 'Friday, October 9').locator('[data-trip-window="dinner"]');
    await expect(pairing).toContainText('Dinner before Pass2 Friday Show, around 6:00 PM');
    await expect(pairing).toContainText('Pass2 Supper Club');
    await expect(pairing).toContainText('open until 10 PM');
    await expect(pairing).not.toContainText('Pass2 Lunch Only');

    const hotels = page.getByRole('list', { name: 'Hotels nearest these events' }).getByRole('link');
    await expect(hotels).toHaveCount(1);
    await expect(hotels.first()).toContainText('Pass2 Hotel Near');
    await expect(page.getByText(/Straight-line distance from Wells Fargo Arena/)).toBeVisible();
    await expect(page.locator('[data-trip-window="summary"]').getByRole('link', { name: '1 hotel within 1 mi' })).toHaveAttribute(
      'href',
      '#trip-stay-heading',
    );
  });

  test('focus moves to the window heading after "Show what\'s on"', async ({ page }) => {
    await install(page);
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');
    await page.getByLabel('Arriving').fill('2026-10-10');
    await page.getByLabel('Leaving').fill('2026-10-10');
    await page.getByRole('button', { name: "Show what's on" }).click();
    await expect(page.locator('#trip-events-heading')).toBeFocused();
  });

  test('a failed events read does not claim the events have no location', async ({ page }) => {
    await install(page, { eventsFail: true });
    await page.goto('/trip-planner?from=2026-10-09&to=2026-10-11');
    const stay = page.locator('section[aria-labelledby="trip-stay-heading"]');
    await expect(stay).toContainText("Hotels are ranked by distance to your events, which didn't load.", { timeout: 20_000 });
    await expect(stay).not.toContainText('mapped location');
    await expect(stay.getByRole('link', { name: 'Browse all hotels' })).toHaveAttribute('href', '/stay');
  });
});
