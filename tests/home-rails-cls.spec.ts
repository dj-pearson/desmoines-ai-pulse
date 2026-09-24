import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home plan WP2: the For You and recently viewed rails.
 *
 * 1. With an empty get_trending_events and the weather call held back 3s, the
 *    For You rail neither collapses nor grows. It used to render six skeleton
 *    cards and then return null, and the weather notice above it arrived late
 *    as a new 48px block.
 * 2. A guest can steer the rail: tapping Free retitles it "For you" and puts a
 *    reason on each card the pick moved.
 * 3. The recently viewed remove button is a 44px target and visible on touch.
 *
 * Runs against fixtureBackend, so no live Supabase is needed.
 */

const RAIL = 'section[aria-labelledby="for-you-rail-heading"]';

const WEATHER = {
  available: true,
  observedAt: '2026-09-24T18:00:00Z',
  temperatureF: 71,
  feelsLikeF: 71,
  precipitationProbabilityPct: 10,
  shortForecast: 'Sunny',
  isDaytime: true,
  outdoorFriendly: true,
  conditions: 'Sunny',
  reason: 'Sunny and 71F, so outdoor picks are listed first.',
  effectiveTemperatureF: 71,
};

async function delayWeather(page: Page, ms: number) {
  await page.route('**/functions/v1/weather**', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(WEATHER),
    });
  });
}

/** Sum of layout-shift values whose shifted nodes sit inside `selector`. */
async function installShiftObserver(page: Page, selector: string) {
  await page.addInitScript((sel) => {
    const w = window as unknown as { __railShift: number };
    w.__railShift = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{ node?: Node | null }>;
        }>) {
          if (entry.hadRecentInput) continue;
          const inRail = (entry.sources ?? []).some((s) => {
            const el = s.node instanceof Element ? s.node : s.node?.parentElement;
            return !!el?.closest(sel);
          });
          if (inRail) w.__railShift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Not supported in this browser; the height assertion still runs.
    }
  }, selector);
}

test.describe('home rails (WP2)', () => {
  test('empty trending + late weather: the For You rail keeps its height', async ({ page }) => {
    await installFixtureBackend(page);
    await delayWeather(page, 3000);
    await installShiftObserver(page, RAIL);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RAIL);
    await expect(rail).toBeVisible({ timeout: 30_000 });

    // Empty state, not a collapse.
    await expect(rail.getByText('Nothing trending yet.')).toBeVisible();
    await expect(rail.getByRole('link', { name: "See what's on today" })).toHaveAttribute(
      'href',
      '/events/today',
    );

    const before = await rail.boundingBox();
    // The weather line arrives after the 3s hold.
    await expect(page.locator('[data-rail-weather-line]')).toContainText('Sunny', { timeout: 10_000 });
    const after = await rail.boundingBox();

    expect(before?.height).toBeGreaterThan(0);
    expect(after?.height).toBe(before?.height);

    const shift = await page.evaluate(() => (window as unknown as { __railShift: number }).__railShift);
    expect(shift).toBeLessThan(0.05);
  });

  test('a guest who taps Free sees "For you" and a reason on the card', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/rpc/get_trending_events**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([
          {
            id: '30000000-0000-0000-0000-000000000001',
            title: 'Trivia Night',
            date: '2026-10-01T23:00:00Z',
            category: 'Nightlife',
            image_url: null,
            venue: 'Fixture Pub',
            is_featured: false,
            recommendation_score: null,
            recommendation_reason: null,
          },
          {
            id: '30000000-0000-0000-0000-000000000002',
            title: 'Free Concert on the Lawn',
            date: '2026-10-02T23:00:00Z',
            category: 'Music',
            image_url: null,
            venue: 'Fixture Park',
            is_featured: false,
            recommendation_score: null,
            recommendation_reason: null,
          },
        ]),
      }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RAIL);
    await expect(rail.getByRole('heading', { name: 'Trending now' })).toBeVisible({ timeout: 30_000 });

    const free = rail.getByRole('button', { name: 'Free', exact: true });
    await expect(free).toHaveAttribute('aria-pressed', 'false');
    await free.click();

    await expect(free).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.getByRole('heading', { name: 'For you' })).toBeVisible();
    await expect(rail.getByText('Because you picked Free')).toBeVisible();
    // The matching card moved to the front.
    await expect(rail.locator('a[href^="/events/"]').first()).toContainText('Free Concert on the Lawn');
  });

  test.describe('on a touch phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('recently viewed remove button is a visible 44px target', async ({ page }) => {
      await installFixtureBackend(page);
      await page.addInitScript(() => {
        const now = Date.now();
        const entries = [1, 2, 3].map((i) => ({
          id: `e${i}`,
          type: 'event',
          title: `Viewed event ${i}`,
          href: `/events/viewed-event-${i}-2026-10-01`,
          viewedAt: now - i * 1000,
        }));
        try {
          window.localStorage.setItem('dmi_recently_viewed_v1', JSON.stringify(entries));
        } catch {
          // storage blocked; the rail will not render and the test fails loudly
        }
      });

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const remove = page.getByRole('button', { name: 'Remove Viewed event 1 from recently viewed' });
      await expect(remove).toBeVisible({ timeout: 30_000 });

      const box = await remove.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      const opacity = await remove.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(opacity)).toBe(1);
    });
  });
});
