import { test, expect, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home plan WP10: the "Tonight in Des Moines" rail.
 *
 * The clock is pinned to Thursday 2026-09-24 at 16:00 CDT (after 15:00, per
 * the acceptance line), and the events and restaurants tables are answered
 * with rows that make a plan: three shows downtown this evening and three
 * restaurants a few blocks away that are open at dinner time. The shared
 * fixtureBackend rows are dated 2026-10-01, so they would never be "tonight";
 * these handlers are registered after it and win.
 *
 * Locators use roles and data-tonight-* attributes: vite.config.ts strips
 * data-testid from every build.
 *
 * What is asserted is what the visitor gets: at least three paired cards, each
 * linking to an event and a restaurant, no paywall on the way, and no layout
 * shift when the rows land. Distance and opening-hours rules are unit-tested
 * with a fixed clock in src/lib/__tests__/tonightPairings.test.ts.
 */

const NOW = new Date('2026-09-24T21:00:00Z'); // 16:00 CDT
const ISO = '2026-09-01T00:00:00Z';

function tonightEvent(i: number, startUtc: string, latitude: number, longitude: number) {
  return {
    id: `40000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Tonight Show ${i}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    date: startUtc,
    enhanced_description: null,
    event_start_local: null,
    event_start_utc: startUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude,
    location: 'Des Moines',
    longitude,
    original_description: 'A fixture event for the Tonight rail.',
    price: i === 0 ? 'Free' : '$20',
    source_url: 'https://example.com/fixture',
    updated_at: ISO,
    venue: `Tonight Venue ${i}`,
    writeup_generated_at: null,
  };
}

function nearbyRestaurant(i: number, latitude: number, longitude: number) {
  return {
    id: `50000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Supper Club ${i}`,
    city: 'Des Moines',
    created_at: ISO,
    cuisine: 'American',
    data_quality_score: 80,
    description: 'A fixture restaurant for the Tonight rail.',
    enhanced: false,
    google_place_id: null,
    image_url: null,
    is_featured: false,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude,
    location: 'Des Moines',
    longitude,
    merged_at: null,
    merged_into: null,
    opening: 'Daily 11am-11pm',
    opening_date: null,
    opening_timeframe: null,
    phone: '515-555-0100',
    popularity_score: 50,
    price_range: '$$',
    rating: 4.5,
    slug: `supper-club-${i}`,
    source_url: 'https://example.com/fixture',
    status: 'active',
    updated_at: ISO,
    website: 'https://example.com/fixture',
    writeup_generated_at: null,
  };
}

const EVENTS = [
  tonightEvent(0, '2026-09-25T00:00:00Z', 41.5875, -93.6235), // 19:00 CDT
  tonightEvent(1, '2026-09-25T00:30:00Z', 41.5905, -93.6105), // 19:30 CDT
  tonightEvent(2, '2026-09-25T01:00:00Z', 41.5860, -93.6300), // 20:00 CDT
];

const RESTAURANTS = [
  nearbyRestaurant(0, 41.5880, -93.6240),
  nearbyRestaurant(1, 41.5910, -93.6110),
  nearbyRestaurant(2, 41.5865, -93.6295),
];

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(rows),
  });
}

test.describe('Home: Tonight rail', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/events?**', (route) => json(route, EVENTS));
    await page.route('**/rest/v1/restaurants?**', (route) => json(route, RESTAURANTS));
  });

  test('shows three or more dinner-then-event plans, with no paywall', async ({ page }) => {
    await page.goto('/');

    const rail = page.getByRole('region', { name: 'Tonight in Des Moines' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('heading', { name: 'Tonight in Des Moines' })).toBeVisible();

    const paired = rail.locator('li[data-tonight-card][data-paired="true"]');
    await expect(paired.first()).toBeVisible();
    expect(await paired.count()).toBeGreaterThanOrEqual(3);

    const first = paired.first();
    await expect(first).toContainText('Dinner at Supper Club');
    await expect(first).toContainText(/\d\.\d mi|under 0\.1 mi/);
    await expect(first).toContainText(/at \d{1,2}:\d{2} (AM|PM)/);

    const restaurantHref = await first.locator('a[data-tonight-link="restaurant"]').getAttribute('href');
    const eventHref = await first.locator('a[data-tonight-link="event"]').getAttribute('href');
    expect(restaurantHref).toMatch(/^\/restaurants\/supper-club-\d$/);
    expect(eventHref).toMatch(/^\/events\/tonight-show-\d/);

    // Nothing on the rail sends an anonymous visitor to a paywall.
    await expect(rail.getByText(/insider|upgrade|subscribe/i)).toHaveCount(0);
  });

  test('keeps its height when data arrives (no layout shift)', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/rest/v1/events?**', async (route) => {
      await gate;
      return json(route, EVENTS);
    });

    await page.goto('/');
    const rail = page.getByRole('region', { name: 'Tonight in Des Moines' });
    await expect(rail).toBeVisible();
    const before = await rail.boundingBox();

    release();
    await expect(rail.locator('li[data-tonight-card]').first()).toBeVisible();
    const after = await rail.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThanOrEqual(1);
  });

  test('shows a real error state, not an empty one, when events fail', async ({ page }) => {
    await page.route('**/rest/v1/events?**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ code: 'XX000', message: 'fixture failure' }),
      }),
    );

    await page.goto('/');
    const rail = page.getByRole('region', { name: 'Tonight in Des Moines' });
    await expect(rail.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    await expect(rail.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
