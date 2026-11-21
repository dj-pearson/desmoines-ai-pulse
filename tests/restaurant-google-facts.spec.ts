/**
 * Google's rating and price on a restaurant page (WEB-BE-070).
 *
 * The rating was shown with no count and no date, and the price was credited
 * to Google ("on Google", and "Google lists ..." in the FAQPage JSON-LD)
 * whatever had written it. These assert the rating carries Google's count,
 * the date it was checked and a link to the listing, and that Google is named
 * for the price only when price_range_source says Google supplied it.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Lucca',
  slug: 'lucca',
  phone: '515-555-0100',
  location: '420 E Locust St, Des Moines, IA 50309',
  cuisine: 'Italian',
  description: 'A small Italian place in the East Village.',
  image_url: null,
  latitude: 41.59,
  longitude: -93.61,
  rating: 4.6,
  price_range: '$$',
};

async function stubRestaurant(page: Page, overrides: Record<string, unknown>) {
  const row = { ...BASE, ...overrides };
  await page.route('**/rest/v1/restaurants*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) }),
  );
  await page.route('**/rest/v1/restaurant_menus*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/functions/v1/**', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
}

async function jsonLd(page: Page): Promise<string> {
  return (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n');
}

test('shows the Google rating with its count, the date it was checked and a link to the listing', async ({ page }) => {
  await stubRestaurant(page, {
    google_review_count: 1234,
    google_rating_checked_at: '2026-11-21T15:00:00Z',
    google_maps_uri: 'https://maps.google.com/?cid=4242',
  });
  await page.goto('/restaurants/lucca');

  // Visible matches only: the FAQ repeats the line inside a closed <details>,
  // which now comes first in the DOM since the details tile went (WEB-UX-088).
  await expect(page.getByText('1,234 reviews, checked November 21, 2026').filter({ visible: true }).first()).toBeVisible();
  const listing = page.getByRole('link', { name: 'See it on Google' });
  await expect(listing).toHaveAttribute('href', 'https://maps.google.com/?cid=4242');
  await expect(page.getByText('Rating from Google, 1,234 reviews, checked November 21, 2026')).toBeVisible();
});

test('says the check date is not recorded rather than showing the rating undated', async ({ page }) => {
  await stubRestaurant(page, {});
  await page.goto('/restaurants/lucca');

  await expect(page.getByText('Lucca').first()).toBeVisible();
  await expect(page.getByText('check date not recorded').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'See it on Google' })).toHaveCount(0);
});

test('names Google for the price when Google supplied it', async ({ page }) => {
  await stubRestaurant(page, { price_range_source: 'google' });
  await page.goto('/restaurants/lucca');

  await expect(page.getByText('price level on Google')).toBeVisible();
  await expect.poll(() => jsonLd(page)).toContain('Google lists Lucca at $$');
});

test('does not credit Google with a price it did not supply', async ({ page }) => {
  await stubRestaurant(page, { price_range_source: null });
  await page.goto('/restaurants/lucca');

  // The tier is still shown, with no source named.
  await expect(page.getByText('price level', { exact: true })).toBeVisible();
  await expect(page.getByText('price level on Google')).toHaveCount(0);
  await expect.poll(() => jsonLd(page)).toContain('Lucca is listed at $$');
  expect(await jsonLd(page)).not.toContain('Google lists');
});
