import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Event detail (docs/page-plans/events.md WP8).
 *
 *   - A backend failure is not a 404: the page offers Retry and publishes no
 *     robots noindex, so an outage cannot drop live events from the index.
 *   - /events/<uuid>, which push taps, favorites and emails still build, lands
 *     on the canonical /events/<title>-<yyyy-mm-dd> URL.
 *
 * Not registered in a lane by this package; the integrator adds it.
 */

async function cutTheBackend(page: Page) {
  await page.route('**://*.supabase.co/**', (route) => route.abort('failed'));
  await page.route('**/rest/v1/**', (route) => route.abort('failed'));
  await page.route('**/functions/v1/**', (route) => route.abort('failed'));
}

/**
 * installFixtureBackend answers every events read with the same 12 rows, and
 * this postgrest-js implements maybeSingle() on a GET by counting the array it
 * gets back: 12 rows for `id=eq.<uuid>` is PGRST116, which the page rightly
 * shows as a load failure. A primary-key read has one answer, so this answers
 * `id=eq.` with the one fixture row that has that id (or none) and passes
 * everything else through to the fixture. Registered after it, so it wins.
 */
const JAZZ_ID = '20000000-0000-0000-0000-000000000000';
const JAZZ_ROW = {
  id: JAZZ_ID,
  title: 'Jazz Night at the Fixture',
  description: 'An event supplied by tests/support/fixtureBackend.',
  category: 'Music',
  date: '2026-10-01',
  event_start_utc: '2026-10-01T19:00:00Z',
  start_time: '19:00:00',
  end_time: null,
  location: 'Des Moines',
  venue: 'Fixture Venue 0',
  city: 'Des Moines',
  state: 'IA',
  address: '100 Locust St',
  image_url: null,
  price: 'Free',
  is_featured: true,
  latitude: 41.58,
  longitude: -93.62,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

async function answerIdLookups(page: Page) {
  await page.route('**/rest/v1/events?**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    if (!id || !id.startsWith('eq.')) return route.fallback();
    const rows = id === `eq.${JAZZ_ID}` ? [JAZZ_ROW] : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'content-range': rows.length ? '0-0/1' : '*/0',
      },
      body: JSON.stringify(rows),
    });
  });
}

test.describe('event detail', () => {
  test('backend down: Retry, no noindex', async ({ page }) => {
    await cutTheBackend(page);
    await page.goto('/events/jazz-night-at-the-fixture-2026-10-01');

    await expect(page.getByRole('heading', { name: /couldn't load this event/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(page.getByText('Event Not Found')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test('a UUID link redirects to the canonical slug', async ({ page }) => {
    await installFixtureBackend(page);
    await answerIdLookups(page);
    await page.goto(`/events/${JAZZ_ID}`);

    await expect(page).toHaveURL(/\/events\/jazz-night-at-the-fixture-2026-10-01$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: /Jazz Night at the Fixture/ })).toBeVisible();
  });
});
