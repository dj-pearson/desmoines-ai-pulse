import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The Tonight rail (home plan WP10, home pass-2 WP2).
 *
 * The clock is pinned to Thursday 2026-09-24 at 16:00 CDT unless a test says
 * otherwise, and the events and restaurants tables are answered with rows that
 * make a plan: three shows downtown this evening and three restaurants a few
 * blocks away that are open at dinner time. The shared fixtureBackend rows are
 * dated 2026-10-01, so they would never be "tonight"; these handlers are
 * registered after it and win.
 *
 * The browser runs in Los Angeles on purpose: the rail's clock is Central, and
 * a reader two hours behind must still see Central times and a Central
 * "tonight" (pass-2 WP2 item 13).
 *
 * Locators use roles and data-tonight-* attributes: vite.config.ts strips
 * data-testid from every build.
 *
 * Distance, opening-hours and window rules are unit-tested with a fixed clock
 * in src/lib/__tests__/tonightPairings.test.ts. What is asserted here is what
 * the visitor gets.
 */

test.use({ timezoneId: 'America/Los_Angeles' });

const NOW = new Date('2026-09-24T21:00:00Z'); // 16:00 CDT
const ISO = '2026-09-01T00:00:00Z';

function tonightEvent(
  i: number,
  startUtc: string,
  latitude: number,
  longitude: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id: `40000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Tonight Show ${i}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    date: startUtc,
    enhanced_description: null,
    event_start_local: null,
    end_date: null as string | null,
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
    ...extra,
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

/** The rail, found by its heading ("Tonight, Thursday, Sep 24"). */
function railOf(page: Page) {
  return page.getByRole('region', { name: /^Tonight/ });
}

/** Every "Dinner h:mm AM/PM" on the rail, as minutes after Central midnight. */
async function dinnerMinutes(page: Page): Promise<number[]> {
  const texts = await railOf(page).locator('[data-tonight-plan]').allInnerTexts();
  const out: number[] = [];
  for (const text of texts) {
    const m = text.match(/Dinner (\d{1,2}):(\d{2}) (AM|PM)/);
    if (!m) continue;
    const hour = (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0);
    out.push(hour * 60 + Number(m[2]));
  }
  return out;
}

test.describe('Home: Tonight rail', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/restaurants?**', (route) => json(route, RESTAURANTS));
  });

  test.describe('at 16:00 CT', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.route('**/rest/v1/events?**', (route) => json(route, EVENTS));
    });

    test('shows three or more dinner-then-event plans, dated, with no paywall', async ({ page }) => {
      await page.goto('/');

      const rail = railOf(page);
      await expect(rail).toBeVisible();
      const heading = rail.getByRole('heading', { level: 2 });
      await expect(heading).toHaveText('Tonight, Thursday, Sep 24');
      await expect(heading.locator('time')).toHaveAttribute('datetime', '2026-09-24');

      const paired = rail.locator('li[data-tonight-card][data-paired="true"]');
      await expect(paired.first()).toBeVisible();
      expect(await paired.count()).toBeGreaterThanOrEqual(3);

      const first = paired.first();
      // 19:00 CT show, so dinner at 5:30 PM Central even in a Pacific browser.
      await expect(first).toContainText('Dinner 5:30 PM at Supper Club');
      await expect(first).toContainText(/then Tonight Show \d at \d{1,2}:\d{2} (AM|PM)/);
      await expect(first).toContainText(/(\d\.\d mi|under 0\.1 mi) from the venue, open until 11 PM/);

      const restaurantHref = await first.locator('a[data-tonight-link="restaurant"]').getAttribute('href');
      const eventHref = await first.locator('a[data-tonight-link="event"]').getAttribute('href');
      expect(restaurantHref).toMatch(/^\/restaurants\/supper-club-\d$/);
      expect(eventHref).toMatch(/^\/events\/tonight-show-\d/);

      // Nothing on the rail sends an anonymous visitor to a paywall.
      await expect(rail.getByText(/insider|upgrade|subscribe/i)).toHaveCount(0);
      // Live text stays out of search snippets.
      await expect(rail).toHaveAttribute('data-nosnippet', '');
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
      const rail = railOf(page);
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
      const rail = railOf(page);
      await expect(rail.getByRole('alert')).toBeVisible({ timeout: 30_000 });
      await expect(rail.getByRole('button', { name: 'Try again' })).toBeVisible();
    });
  });

  test('at 09:00 CT lists only the evening show and no daytime dinner', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-24T14:00:00Z')); // 09:00 CDT
    const rows = [
      tonightEvent(10, '2026-09-24T15:00:00Z', 41.5875, -93.6235), // 10:00 CDT
      tonightEvent(11, '2026-09-25T00:30:00Z', 41.5905, -93.6105), // 19:30 CDT
    ];
    await page.route('**/rest/v1/events?**', (route) => json(route, rows));

    await page.goto('/');
    const rail = railOf(page);
    await expect(rail.getByRole('heading', { level: 2 })).toHaveText('Tonight, Thursday, Sep 24');

    const cards = rail.locator('li[data-tonight-card]');
    await expect(cards.first()).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Tonight Show 11');
    await expect(rail).not.toContainText('Tonight Show 10');

    for (const minutes of await dinnerMinutes(page)) {
      expect(minutes).toBeGreaterThanOrEqual(16 * 60);
    }
  });

  test('drops a show that has started while the tab stays open', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-24T23:00:00Z') }); // 18:00 CDT
    const rows = [
      tonightEvent(20, '2026-09-25T00:00:00Z', 41.5875, -93.6235), // 19:00 CDT
      tonightEvent(21, '2026-09-25T03:00:00Z', 41.5905, -93.6105), // 22:00 CDT
    ];
    await page.route('**/rest/v1/events?**', (route) => json(route, rows));

    await page.goto('/');
    const rail = railOf(page);
    await expect(rail.locator('li[data-tonight-card]')).toHaveCount(2);

    // 21:45 CDT, then one tick of the minute clock.
    await page.clock.setSystemTime(new Date('2026-09-25T02:45:00Z'));
    await page.clock.runFor(61_000);

    await expect(rail).not.toContainText('Tonight Show 20');
    await expect(rail.locator('li[data-tonight-card]')).toHaveCount(1);
  });

  test('shows a festival that started yesterday, with no invented dinner', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    const rows = [
      tonightEvent(30, '2026-09-23T15:00:00Z', 41.5875, -93.6235, {
        title: 'Fall Fest',
        end_date: '2026-09-26T03:00:00Z',
      }),
      ...EVENTS,
    ];
    await page.route('**/rest/v1/events?**', (route) => json(route, rows));

    await page.goto('/');
    const card = railOf(page).locator('li[data-tonight-card]', { hasText: 'Fall Fest' });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-paired', 'false');
    await expect(card).toContainText('on until Fri, Sep 25');
    await expect(card).not.toContainText('Dinner');
  });

  test('a 120-character title fits its card, time and distance included', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    const longTitle =
      'The Annual Greater Des Moines Metro Autumn Harvest Celebration, Craft Beer Garden, Live Music Showcase and Food Truck Rally';
    expect(longTitle.length).toBeGreaterThanOrEqual(120);
    const rows = [
      tonightEvent(40, '2026-09-25T00:00:00Z', 41.5875, -93.6235, { title: longTitle }),
    ];
    await page.route('**/rest/v1/events?**', (route) => json(route, rows));

    await page.goto('/');
    const card = railOf(page).locator('li[data-tonight-card]').first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-tonight-dinner-line]')).toContainText(/mi from the venue/);
    await expect(card).toContainText('7:00 PM');

    const fits = await card.evaluate((el) => el.scrollHeight <= el.clientHeight);
    expect(fits).toBe(true);
    // The link's accessible name is the full title, not the cut one.
    await expect(card.getByRole('link', { name: longTitle })).toHaveCount(1);
  });
});
