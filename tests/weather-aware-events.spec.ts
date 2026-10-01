/**
 * Weather-aware event ordering (WEB-FEAT-022).
 *
 * The acceptance criterion this covers: BOTH branches - weather present and
 * weather unavailable - must render a populated list. The failure mode worth
 * guarding is not a wrong sort, it is a page that empties itself because a
 * forecast arrived, or because one did not.
 *
 * Every upstream is stubbed, so these run without Supabase credentials and
 * without reaching api.weather.gov.
 */
import { test, expect, type Page } from '@playwright/test';

const EVENTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Indoor Gallery Night',
    date: new Date().toISOString(),
    location: 'Des Moines, IA',
    venue: 'Moberg Gallery',
    price: 'Free',
    category: 'Art',
    enhanced_description: 'An indoor gallery opening.',
    original_description: 'An indoor gallery opening.',
    image_url: null,
    event_start_utc: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Outdoor Market Morning',
    date: new Date().toISOString(),
    location: 'Des Moines, IA',
    venue: 'Court Avenue',
    price: 'Free',
    category: 'Market',
    enhanced_description: 'An outdoor farmers market.',
    original_description: 'An outdoor farmers market.',
    image_url: null,
    event_start_utc: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INDOOR_FLAGS = [
  { id: EVENTS[0].id, is_indoor: true },
  { id: EVENTS[1].id, is_indoor: false },
];

/**
 * Stub the events list and the is_indoor side query.
 *
 * Order matters: the more specific `select=id,is_indoor` pattern is registered
 * first, because Playwright matches the most recently registered route first
 * and both requests hit /rest/v1/events.
 */
async function stubEvents(page: Page, opts: { indoorFlags: boolean }) {
  await page.route('**/rest/v1/events*', (route) => {
    const url = route.request().url();
    const isFlagQuery = url.includes('is_indoor');
    if (isFlagQuery) {
      // `indoorFlags: false` simulates the window before migration
      // 20260908000001 is applied: PostgREST answers 42703 and the reorder is
      // skipped. The list must still render.
      return opts.indoorFlags
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(INDOOR_FLAGS),
          })
        : route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: '42703',
              message: 'column events.is_indoor does not exist',
            }),
          });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EVENTS),
    });
  });
}

/** Stub the weather edge function. `null` means the call fails outright. */
async function stubWeather(
  page: Page,
  payload: Record<string, unknown> | null,
) {
  await page.route('**/functions/v1/weather*', (route) =>
    payload === null
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        }),
  );
}

const WET = {
  available: true,
  observedAt: new Date().toISOString(),
  temperatureF: 54,
  feelsLikeF: 54,
  precipitationProbabilityPct: 80,
  shortForecast: 'Rain Showers Likely',
  isDaytime: true,
  outdoorFriendly: false,
  conditions: 'There is an 80% chance of precipitation (rain showers likely)',
  reason: 'There is an 80% chance of precipitation (rain showers likely), so indoor picks are first.',
  effectiveTemperatureF: 54,
};

const FINE = {
  ...WET,
  temperatureF: 72,
  feelsLikeF: 72,
  precipitationProbabilityPct: 5,
  shortForecast: 'Sunny',
  outdoorFriendly: true,
  conditions: '72F and sunny',
  reason: '72F and sunny, so outdoor picks are first.',
  effectiveTemperatureF: 72,
};

async function visibleTitles(page: Page): Promise<string[]> {
  const titles = await page
    .locator('h3, h2')
    .filter({ hasText: /Indoor Gallery Night|Outdoor Market Morning/ })
    .allTextContents();
  return titles.map((t) => t.trim());
}

test.describe('WEB-FEAT-022 weather-aware ordering on /events/today', () => {
  test('renders every event and explains the order when rain is forecast', async ({ page }) => {
    await stubWeather(page, WET);
    await stubEvents(page, { indoorFlags: true });
    await page.goto('/events/today');

    // Both events present: the reorder ranks, it never filters.
    await expect(page.getByText('Indoor Gallery Night')).toBeVisible();
    await expect(page.getByText('Outdoor Market Morning')).toBeVisible();

    // The adjustment is explained rather than silent.
    await expect(page.getByRole('note')).toContainText('indoor picks are first');

    const titles = await visibleTitles(page);
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(titles[0]).toContain('Indoor');
  });

  test('puts the outdoor event first on a fine day', async ({ page }) => {
    await stubWeather(page, FINE);
    await stubEvents(page, { indoorFlags: true });
    await page.goto('/events/today');

    await expect(page.getByRole('note')).toContainText('outdoor picks are first');
    const titles = await visibleTitles(page);
    expect(titles[0]).toContain('Outdoor');
  });

  test('renders a populated list when the weather call fails', async ({ page }) => {
    await stubWeather(page, null);
    await stubEvents(page, { indoorFlags: true });
    await page.goto('/events/today');

    await expect(page.getByText('Indoor Gallery Night')).toBeVisible();
    await expect(page.getByText('Outdoor Market Morning')).toBeVisible();
    // No verdict means no banner, rather than a banner apologising for itself.
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('renders a populated list when is_indoor is not deployed yet', async ({ page }) => {
    // The regression that motivated the separate request: a 42703 on the flag
    // query must cost the reorder and nothing else.
    await stubWeather(page, WET);
    await stubEvents(page, { indoorFlags: false });
    await page.goto('/events/today');

    await expect(page.getByText('Indoor Gallery Night')).toBeVisible();
    await expect(page.getByText('Outdoor Market Morning')).toBeVisible();
  });

  test('renders a populated list when weather reports itself unavailable', async ({ page }) => {
    await stubWeather(page, {
      available: false,
      observedAt: null,
      temperatureF: null,
      feelsLikeF: null,
      precipitationProbabilityPct: null,
      shortForecast: null,
      isDaytime: null,
      outdoorFriendly: null,
      conditions: 'Weather is unavailable right now',
      reason: 'Weather is unavailable right now.',
      effectiveTemperatureF: null,
    });
    await stubEvents(page, { indoorFlags: true });
    await page.goto('/events/today');

    await expect(page.getByText('Outdoor Market Morning')).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });
});

test.describe('WEB-FEAT-022 homepage conditions notice', () => {
  test('states conditions without claiming anything was reordered', async ({ page }) => {
    await stubWeather(page, WET);
    await page.goto('/');

    // Assert the real conditions phrase, not just the trailing copy - an
    // earlier version of this test passed on the "unavailable" fallback
    // because the fixture was missing `conditions` entirely.
    await expect(
      page.getByText('There is an 80% chance of precipitation (rain showers likely)'),
    ).toBeVisible();
    await expect(page.getByText('in Des Moines right now.')).toBeVisible();

    // The homepage renders personalized rails and deliberately does not sort
    // them, so the ranking clause from `reason` must not appear here.
    await expect(page.locator('body')).not.toContainText('indoor picks are first');
    await expect(page.getByRole('link', { name: /indoor picks for today/i })).toBeVisible();
  });

  test('renders nothing when there is no verdict', async ({ page }) => {
    await stubWeather(page, null);
    await page.goto('/');
    await expect(page.getByText('in Des Moines right now.')).toHaveCount(0);
  });
});
