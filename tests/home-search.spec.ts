import { test, expect, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WP1 (docs/page-plans/home.md): Home has ONE free-text search, in the hero,
 * and it goes somewhere.
 *
 * Three things this pins:
 *  1. There is exactly one free-text input on `/`. There used to be two - the
 *     NLP bar and the structured SearchSection - plus a toast-driven filter
 *     path that searched only the 100 rows the dashboard happened to hold.
 *  2. Enter navigates to /search?q=, the page the WebSite SearchAction names.
 *  3. NLP result links resolve. They were `/${type}/${item.id}` for every type,
 *     and the event detail page matches a date-suffixed slug, so every event
 *     result was an Event Not Found. The nlp-search function is stubbed here,
 *     so this is a statement about the links the component builds, not about
 *     the edge function.
 */

const NLP_RESPONSE = {
  success: true,
  query: 'Live music events tonight',
  parsedIntent: { contentTypes: ['events', 'restaurants', 'attractions'], keywords: ['live music'], confidence: 0.9, originalQuery: 'Live music events tonight' },
  results: {
    events: [
      {
        id: '30000000-0000-0000-0000-000000000001',
        title: 'Jazz on the Riverfront',
        date: '2026-10-01T00:30:00Z',
        event_start_utc: '2026-10-01T00:30:00Z',
        location: 'Des Moines',
        category: 'Music',
      },
    ],
    restaurants: [
      { id: '30000000-0000-0000-0000-000000000002', name: "Proof's Kitchen", slug: 'proofs-kitchen' },
    ],
    attractions: [
      { id: '30000000-0000-0000-0000-000000000003', name: 'Pappajohn Sculpture Park', type: 'park' },
    ],
  },
  metadata: { totalResults: 3, responseTimeMs: 12, modelUsed: 'stub' },
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function stubNlpSearch(route: Route) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(NLP_RESPONSE),
  });
}

test.beforeEach(async ({ page }) => {
  await installFixtureBackend(page);
  // Registered after the fixture backend so it wins for this function.
  await page.route('**/functions/v1/nlp-search**', stubNlpSearch);
});

test('home has exactly one free-text search input', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('search')).toBeVisible({ timeout: 30_000 });

  const freeText = page.locator('input[type="search"]:visible, input[type="text"]:visible, input:not([type]):visible');
  await expect(freeText).toHaveCount(1);
});

test('Enter in the hero search lands on /search?q=', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const input = page.getByRole('search').getByRole('combobox');
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill('Jazz Kitchen');
  await input.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=Jazz(%20|\+)Kitchen$/);
});

test('NLP result links use the detail pages\' slugs', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const input = page.getByRole('search').getByRole('combobox');
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.focus();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Live music events tonight' }).click();

  const eventLink = page.locator('a[data-result-type="events"]').first();
  await expect(eventLink).toBeVisible();
  await expect(eventLink).toHaveAttribute('href', /^\/events\/[a-z0-9-]+-\d{4}-\d{2}-\d{2}$/);
  // 00:30 UTC on Oct 1 is 19:30 CDT on Sep 30: the slug carries the Central date.
  await expect(eventLink).toHaveAttribute('href', '/events/jazz-on-the-riverfront-2026-09-30');

  await expect(page.locator('a[data-result-type="restaurants"]').first()).toHaveAttribute(
    'href',
    '/restaurants/proofs-kitchen',
  );
  await expect(page.locator('a[data-result-type="attractions"]').first()).toHaveAttribute(
    'href',
    '/attractions/pappajohn-sculpture-park',
  );

  // The live region names what the results are for.
  await expect(page.getByText('3 results for Live music events tonight.')).toBeAttached();

  // Escape closes the panel.
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});
