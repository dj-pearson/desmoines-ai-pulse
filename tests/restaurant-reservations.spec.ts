/**
 * Reservation call-to-action on a restaurant page (WEB-FEAT-024).
 *
 * The page used to label a bare tel: link "Call to Reserve" for every
 * restaurant that had a phone number. These assert the claim is now made only
 * on evidence, and that a booking link appears when one exists.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Noce',
  slug: 'noce',
  phone: '515-555-0100',
  website: 'https://nocedsm.com',
  location: 'Des Moines, IA',
  cuisine: 'Jazz Club',
  description: 'A jazz supper club.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.6,
};

async function stubRestaurant(page: Page, overrides: Record<string, unknown>) {
  const row = { ...BASE, ...overrides };
  await page.route('**/rest/v1/restaurants*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // maybeSingle() accepts a single object or an array; an array is safe here.
      body: JSON.stringify([row]),
    }),
  );
  // Everything else the page pulls in can be empty.
  await page.route('**/rest/v1/restaurant_menus*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/functions/v1/**', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
}

test('offers a booking link when a curated reservation URL exists', async ({ page }) => {
  await stubRestaurant(page, {
    reservable: true,
    reservation_url: 'https://www.opentable.com/r/noce',
    reservation_provider: 'opentable',
  });
  await page.goto('/restaurants/noce');

  const reserve = page.getByRole('link', { name: /Reserve a table/i }).first();
  await expect(reserve).toBeVisible();
  await expect(reserve).toHaveAttribute('href', 'https://www.opentable.com/r/noce');
});

test('falls back to the Google listing for a reservable restaurant', async ({ page }) => {
  await stubRestaurant(page, {
    reservable: true,
    google_maps_uri: 'https://maps.google.com/?cid=999',
  });
  await page.goto('/restaurants/noce');

  const reserve = page.getByRole('link', { name: /Reserve a table/i }).first();
  await expect(reserve).toBeVisible();
  await expect(reserve).toHaveAttribute('href', 'https://maps.google.com/?cid=999');
});

test('never claims reservations when reservable is unknown', async ({ page }) => {
  await stubRestaurant(page, {});
  await page.goto('/restaurants/noce');

  await expect(page.getByText('Noce').first()).toBeVisible();
  // The old page said "Call to Reserve" here purely because a phone existed.
  await expect(page.getByText(/Call to Reserve/i)).toHaveCount(0);
  await expect(page.getByText(/Reserve a table/i)).toHaveCount(0);
});

test('never claims reservations when the restaurant does not take them', async ({ page }) => {
  await stubRestaurant(page, { reservable: false, google_maps_uri: 'https://maps.google.com/?cid=1' });
  await page.goto('/restaurants/noce');

  await expect(page.getByText('Noce').first()).toBeVisible();
  await expect(page.getByText(/Reserve a table/i)).toHaveCount(0);
  // "Call to Reserve" is the old copy and asserts the same untrue thing.
  await expect(page.getByText(/Call to Reserve/i)).toHaveCount(0);
});
