import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Eat & Drink pass 2 WP4.1-4.7: /restaurants/open-now.
 *
 * The count is over hours we can read, 300 open places are 24 cards and then
 * rows, "Open at" and the filters live in the URL and survive a reload, the
 * dish search crosses menu matches with the hours, the prerender carries no
 * clock or list, and /real-time lands here. The clock is pinned with
 * page.clock; the fixture backend does not filter, so every narrowing below
 * is the page's own.
 */

const ISO = '2026-09-01T00:00:00Z';

function restaurant(i: number, name: string, opening: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: `61000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
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
    slug: `open-now-p2-${i}`,
    source_url: null,
    status: 'open',
    updated_at: ISO,
    website: null,
    writeup_generated_at: null,
    ...extra,
  };
}

function json(route: Route, rows: unknown) {
  const count = Array.isArray(rows) ? rows.length : 1;
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': count > 0 ? `0-${count - 1}/${count}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function setup(page: Page, now: Date, rows: unknown[]) {
  await page.clock.setFixedTime(now);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, rows));
}

/** Thu 2026-09-24 20:00 CDT. */
const EVENING = new Date('2026-09-25T01:00:00Z');
/** Fri 2026-09-25 18:00 CDT. */
const SIX_PM = new Date('2026-09-25T23:00:00Z');

test.describe('/restaurants/open-now, pass 2', () => {
  test('counts over readable hours and lists the unreadable ones', async ({ page }) => {
    await setup(page, EVENING, [
      restaurant(1, 'Open Late', 'Daily 11am-11pm'),
      restaurant(2, 'Lunch Only', 'Daily 11am-2pm'),
      restaurant(3, 'Call Us', 'Call for hours'),
    ]);
    await page.goto('/restaurants/open-now');

    await expect(page.locator('[data-open-now-summary]')).toContainText(
      '1 of 2 places whose hours we can read is open right now',
    );
    const unreadable = page.locator('[data-open-now-unreadable]');
    await expect(unreadable.locator('summary')).toHaveText("Hours we couldn't read (1)");
    await unreadable.locator('summary').click();
    await expect(unreadable.getByRole('link', { name: 'Call Us' })).toHaveAttribute('href', '/restaurants/open-now-p2-3');
    await expect(page.locator('[data-open-now-clock]')).toHaveAttribute('datetime', '2026-09-25T01:00:00.000Z');
  });

  test('300 open places render as 24 cards and then rows', async ({ page }) => {
    const rows = Array.from({ length: 300 }, (_, i) => restaurant(i, `Place ${String(i).padStart(3, '0')}`, 'Daily 7am-11pm'));
    await setup(page, EVENING, rows);
    await page.goto('/restaurants/open-now');

    await expect(page.locator('[data-open-now-card]')).toHaveCount(24);
    await expect(page.locator('[data-open-now-row]')).toHaveCount(36);
    await page.getByRole('button', { name: 'Show all 276 more open' }).click();
    await expect(page.locator('[data-open-now-row]')).toHaveCount(276);
    await expect(page.locator('[data-open-now-card]')).toHaveCount(24);
  });

  test('"Open at" and cuisine restore from the URL and narrow the list', async ({ page }) => {
    await setup(page, SIX_PM, [
      restaurant(1, 'Taqueria Late', 'Daily 11am-1am', { cuisine: 'Mexican' }),
      restaurant(2, 'Taqueria Early', 'Daily 11am-9pm', { cuisine: 'Mexican' }),
      restaurant(3, 'Diner Late', 'Daily 11am-1am', { cuisine: 'American' }),
      restaurant(4, 'Burger Late', 'Daily 11am-1am', { cuisine: 'American' }),
    ]);
    await page.goto('/restaurants/open-now?cuisine=Mexican&at=22:00');

    const heading = page.getByRole('heading', { level: 2, name: /^Open at 10 PM tonight \(1\)$/ });
    await expect(heading).toBeVisible();
    const section = page.locator('section[aria-labelledby="open-now-heading"]');
    await expect(section.getByText('Taqueria Late')).toBeVisible();
    await expect(section.getByText('Taqueria Early')).toHaveCount(0);
    await expect(section.getByText('Diner Late')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mexican', pressed: true })).toBeVisible();
    await expect(page.getByLabel('Open at', { exact: true })).toHaveValue('22:00');

    await page.reload();
    await expect(heading).toBeVisible();
    await expect(page.getByLabel('Open at', { exact: true })).toHaveValue('22:00');
    await expect(section.getByText('Diner Late')).toHaveCount(0);

    await page.getByLabel('Open at', { exact: true }).selectOption('');
    await expect(page).not.toHaveURL(/at=/);
    await expect(page).toHaveURL(/cuisine=Mexican/);
  });

  test('dish search names the dish, the place and its close, and skips places not loaded', async ({ page }) => {
    const rows = [restaurant(1, 'Pho Place', 'Daily 11am-9pm'), restaurant(2, 'Pho Closed', 'Daily 7am-2pm')];
    await setup(page, EVENING, rows);
    await page.route('**/rest/v1/rpc/search_menu_items', (route) =>
      json(route, [
        { item_id: 'a', restaurant_id: rows[0].id, restaurant_name: 'Pho Place', restaurant_slug: rows[0].slug, section_name: 'Soups', item_name: 'Pho tai', item_description: null, price: '13', price_numeric: 13, dietary_tags: [] },
        { item_id: 'b', restaurant_id: rows[1].id, restaurant_name: 'Pho Closed', restaurant_slug: rows[1].slug, section_name: 'Soups', item_name: 'Pho ga', item_description: null, price: '$12', price_numeric: 12, dietary_tags: [] },
        { item_id: 'c', restaurant_id: 'merged-elsewhere', restaurant_name: 'Merged Pho', restaurant_slug: 'merged-pho', section_name: 'Soups', item_name: 'Pho bo', item_description: null, price: '$11', price_numeric: 11, dietary_tags: [] },
      ]),
    );
    await page.goto('/restaurants/open-now');

    await page.getByLabel('Find a dish').fill('pho');
    const dishes = page.locator('[data-open-now-dishes]');
    await expect(dishes.getByRole('listitem')).toHaveText(['Pho tai $13 at Pho Place, closes at 9 PM']);
    await expect(dishes).not.toContainText('Merged Pho');
    await expect(page).toHaveURL(/dish=pho/);
  });

  test('in the prerender: the method, no clock, count or list', async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
    const requests: string[] = [];
    page.on('request', (r) => {
      // The open-now read, and only it, filters on the hours column.
      if (r.url().includes('/rest/v1/restaurants') && r.url().includes('opening=')) requests.push(r.url());
    });
    await setup(page, EVENING, [restaurant(1, 'Open Late', 'Daily 11am-11pm')]);
    await page.goto('/restaurants/open-now');

    await expect(page.getByRole('heading', { level: 1, name: 'Restaurants Open Now in Des Moines' })).toBeVisible();
    await expect(page.locator('[data-open-now-static]')).toContainText('when you open it');
    await expect(page.locator('[data-open-now-clock]')).toHaveCount(0);
    await expect(page.locator('[data-open-now-summary]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Open until');
    expect(requests).toEqual([]);
  });

  test('the FAQ makes no claim the data cannot back', async ({ page }) => {
    await setup(page, EVENING, []);
    await page.goto('/restaurants/open-now');
    // The page's own content (the site footer links the State Fair page),
    // plus every JSON-LD block, which is where the FAQ ships to crawlers.
    const body = page.locator('h1').locator('xpath=ancestor::div[contains(@class, "container")][1]');
    const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(' ');
    for (const claim of ['State Fair', 'fewer 24-hour', 'Sundays', '24 hour restaurants']) {
      expect(jsonLd).not.toContain(claim);
    }
    await expect(page.locator('section[aria-labelledby="how-open-now-heading"]')).toContainText(
      "Holiday and seasonal hours aren't in our listings",
    );
    for (const claim of ['State Fair', 'fewer 24-hour', 'lunch rush', 'Court Avenue', 'Sundays']) {
      await expect(body).not.toContainText(claim);
    }
  });

  test('/real-time lands on open-now', async ({ page }) => {
    await setup(page, EVENING, []);
    await page.goto('/real-time');
    await expect(page).toHaveURL(/\/restaurants\/open-now$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Restaurants Open Now in Des Moines' })).toBeVisible();
  });
});
