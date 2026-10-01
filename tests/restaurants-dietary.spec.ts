import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Eat & Drink pass 2 WP4.12-4.13: /restaurants/dietary.
 *
 * Each diet has its own self-canonical path, the old `?diet=` URL ends on that
 * path, and "Show N more" reveals the rows already fetched instead of sending
 * the visitor to the unfiltered hub.
 */

const ISO = '2026-09-01T00:00:00Z';

function restaurant(i: number) {
  return {
    id: `62000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Vegan Place ${String(i).padStart(2, '0')}`,
    city: 'Des Moines',
    created_at: ISO,
    cuisine: 'Vegan',
    data_quality_score: 80,
    description: 'Vegan bowls.',
    enhanced: false,
    google_place_id: null,
    image_url: null,
    is_featured: false,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58,
    location: 'Des Moines',
    longitude: -93.62,
    merged_at: null,
    merged_into: null,
    opening: null,
    opening_date: null,
    opening_timeframe: null,
    phone: null,
    popularity_score: 50,
    price_range: '$$',
    rating: 4.3,
    slug: `vegan-place-${i}`,
    source_url: null,
    status: 'open',
    updated_at: ISO,
    website: null,
    writeup_generated_at: null,
  };
}

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function setup(page: Page, count: number) {
  await installFixtureBackend(page);
  const rows = Array.from({ length: count }, (_, i) => restaurant(i));
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, rows));
}

test.describe('/restaurants/dietary', () => {
  test('a diet has its own page, with a self-canonical', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary/vegan');

    await expect(page.getByRole('heading', { level: 1, name: 'Vegan Restaurants in Des Moines' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/restaurants\/dietary\/vegan$/);
    await expect(page.getByRole('button', { name: 'Vegan', pressed: true })).toBeVisible();

    await page.getByRole('button', { name: 'Halal' }).click();
    await expect(page).toHaveURL(/\/restaurants\/dietary\/halal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Halal Restaurants in Des Moines' })).toBeVisible();
  });

  test('the old ?diet= URL ends on the path', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary?diet=vegan');
    await expect(page).toHaveURL(/\/restaurants\/dietary\/vegan$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Vegan Restaurants in Des Moines' })).toBeVisible();
  });

  test('an unknown diet goes to the index', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary/paleo');
    await expect(page).toHaveURL(/\/restaurants\/dietary$/);
    await expect(page.getByRole('link', { name: 'Vegan', exact: true })).toHaveAttribute('href', '/restaurants/dietary/vegan');
  });

  test('"Show more" reveals the fetched rows, and "first 100" only at the limit', async ({ page }) => {
    await setup(page, 50);
    await page.goto('/restaurants/dietary/vegan');

    await expect(page.getByRole('heading', { level: 2, name: 'Mentions vegan (50)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Vegan Place / })).toHaveCount(36);
    await page.getByRole('button', { name: 'Show 14 more' }).click();
    await expect(page.getByRole('heading', { level: 3, name: /^Vegan Place / })).toHaveCount(50);
    await expect(page.locator('[data-dietary-more]')).toContainText('Showing 50 of 50');
  });

  test('a full fetch says "first 100"', async ({ page }) => {
    await setup(page, 100);
    await page.goto('/restaurants/dietary/vegan');
    await expect(page.getByRole('heading', { level: 2, name: 'Mentions vegan (first 100)' })).toBeVisible();
  });
});
