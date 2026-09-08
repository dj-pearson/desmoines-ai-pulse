/**
 * Add-to-calendar on event cards (WEB-FEAT-026).
 *
 * The behaviour worth pinning: the control lives inside the card's Link, so the
 * risk is that pressing it navigates to the event instead of opening the menu.
 */
import { test, expect, type Page } from '@playwright/test';

const EVENTS = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Wine, Cheese & Jazz',
    date: '2026-09-08T19:00:00-05:00',
    location: 'Des Moines, IA',
    venue: 'Noce',
    price: 'Free',
    category: 'Music',
    enhanced_description: 'An evening of jazz.',
    original_description: 'An evening of jazz.',
    image_url: null,
    event_start_utc: '2026-09-09T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
];

async function stub(page: Page) {
  await page.route('**/rest/v1/events*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('is_indoor') ? [] : EVENTS),
    }),
  );
  await page.route('**/functions/v1/weather*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
}

test('the calendar control opens a menu instead of navigating', async ({ page }) => {
  await stub(page);
  await page.goto('/events/today');

  await expect(page.getByText('Wine, Cheese & Jazz')).toBeVisible();

  await page.getByRole('button', { name: /Add Wine, Cheese & Jazz to calendar/i }).click();

  // The menu opened...
  await expect(page.getByRole('menuitem', { name: /Google Calendar/i })).toBeVisible();
  // ...and the card's Link did not fire.
  expect(new URL(page.url()).pathname).toBe('/events/today');
});

test('the menu offers every export target', async ({ page }) => {
  await stub(page);
  await page.goto('/events/today');
  await page.getByRole('button', { name: /Add Wine, Cheese & Jazz to calendar/i }).click();

  for (const name of [/Google Calendar/i, /Outlook/i, /Apple/i, /Download/i]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }
});
