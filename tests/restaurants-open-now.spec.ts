import { test, expect, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Eat & Drink plan WP5: /restaurants/open-now.
 *
 * The page reads every restaurant with listed hours and decides which are
 * open on the Central clock, once a minute. These tests pin the clock with
 * page.clock and answer the restaurants table with rows whose hours make the
 * answer obvious. The fixture backend does not filter (on purpose), so the
 * merged and closed rows below reach the page; the page must drop them itself.
 *
 * Locators use roles and data-open-now-* attributes: vite.config.ts strips
 * data-testid from every build.
 */

const ISO = '2026-09-01T00:00:00Z';

function restaurant(i: number, name: string, opening: string, extra: Record<string, unknown> = {}) {
  return {
    id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name,
    city: 'Des Moines',
    created_at: ISO,
    cuisine: 'American',
    data_quality_score: 80,
    description: 'A fixture restaurant for the open-now page.',
    enhanced: false,
    google_place_id: null,
    image_url: null,
    is_featured: false,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5868,
    location: 'Des Moines',
    longitude: -93.625,
    merged_at: null,
    merged_into: null,
    opening,
    opening_date: null,
    opening_timeframe: null,
    phone: '515-555-0100',
    popularity_score: 50,
    price_range: '$$',
    rating: 4.2,
    slug: `open-now-fixture-${i}`,
    source_url: 'https://example.com/fixture',
    status: 'active',
    updated_at: ISO,
    website: 'https://example.com/fixture',
    writeup_generated_at: null,
    ...extra,
  };
}

const ROWS = [
  restaurant(0, 'Zz Test', 'Daily 11am-1am'),
  restaurant(1, 'Ten Oclock Kitchen', 'Daily 11am-10pm'),
  restaurant(2, 'Merged Twin', 'Daily 11am-11pm', { is_merged: true }),
  restaurant(3, 'Gone Diner', 'Daily 11am-11pm', { status: 'closed' }),
];

const MORNING_ONLY = [
  restaurant(10, 'Brunch Barn', 'Daily 9am-2pm'),
  restaurant(11, 'Lunch Counter', 'Daily 11am-3pm'),
];

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function setup(page: import('@playwright/test').Page, now: Date, rows: unknown[]) {
  await page.clock.setFixedTime(now);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, rows));
}

/** Every section that lists places open now. */
function openSections(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: /open now \(|Closing within the hour/i });
}

test.describe('/restaurants/open-now', () => {
  test('lists an open place and never a merged or closed one', async ({ page }) => {
    await setup(page, new Date('2026-09-25T01:00:00Z'), ROWS); // Thu 20:00 CDT
    await page.goto('/restaurants/open-now');

    await expect(openSections(page).getByRole('link', { name: 'Zz Test' })).toBeVisible();
    await expect(page.getByText('Merged Twin')).toHaveCount(0);
    await expect(page.getByText('Gone Diner')).toHaveCount(0);
    await expect(page.locator('[data-open-now-summary]')).toContainText(
      '2 of 2 restaurants with listed hours are open right now',
    );
    await expect(page.locator('[data-open-now-clock]')).toHaveText('8:00 PM CT');
  });

  test.describe('in a Los Angeles browser', () => {
    test.use({ timezoneId: 'America/Los_Angeles' });

    test('uses Des Moines time: a 10 PM Central close is closed at 9:30 PM Pacific', async ({ page }) => {
      await setup(page, new Date('2026-09-25T04:30:00Z'), ROWS); // 21:30 PDT = 23:30 CDT
      await page.goto('/restaurants/open-now');

      await expect(page.locator('[data-open-now-clock]')).toHaveText('11:30 PM CT');
      await expect(openSections(page).getByRole('link', { name: 'Zz Test' })).toBeVisible();
      await expect(openSections(page).getByRole('link', { name: 'Ten Oclock Kitchen' })).toHaveCount(0);
    });
  });

  test('says plainly when nothing is open, with the Central time', async ({ page }) => {
    await setup(page, new Date('2026-09-25T08:00:00Z'), MORNING_ONLY); // Fri 03:00 CDT
    await page.goto('/restaurants/open-now');

    const empty = page.locator('[data-open-now-empty]');
    await expect(
      empty.getByRole('heading', { level: 2, name: 'Nothing we have hours for is open right now (3:00 AM CT)' }),
    ).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Brunch Barn' })).toBeVisible();
    await expect(empty.getByText(/Loading/)).toHaveCount(0);
    await expect(page.getByText('Loading Restaurant Hours')).toHaveCount(0);
    await expect(openSections(page)).toHaveCount(0);
  });
});
