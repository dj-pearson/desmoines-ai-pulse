import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home plan WP2 and pass-2 WP3: the For You and recently viewed rails, and the
 * dashboard's reserved group slots.
 *
 * 1. With an empty For You read held back 1.5s and the weather held back 3s,
 *    the For You rail neither collapses nor grows. It used to render six
 *    skeleton cards and then return null.
 * 2. A guest can steer the rail: tapping Free retitles it "For you" and puts a
 *    reason on the card the pick moved; a pick nothing matches says so in one
 *    line and keeps the plain heading.
 * 3. The recently viewed remove button is a 44px target and visible on touch.
 * 4. Recently viewed with 3 seeded entries is there at first paint and does
 *    not move afterwards.
 * 5. The dashboard with each table answering at 0, 1s and 3s shifts less
 *    than 0.05: each group fills its own three-card slot.
 *
 * Runs against fixtureBackend, so no live Supabase is needed.
 */

const RAIL = 'section[aria-labelledby="for-you-rail-heading"]';
const DASHBOARD = 'section[aria-labelledby="dashboard-heading"]';

function json(route: Route, rows: unknown[]) {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    },
    body: JSON.stringify(rows),
  });
}

/** Answer the anonymous For You read (ordered by trending_score) with `rows`. */
async function routeForYou(page: Page, rows: unknown[], delayMs = 0) {
  await page.route('**/rest/v1/events?*', async (route) => {
    if (!decodeURIComponent(route.request().url()).includes('order=trending_score')) return route.fallback();
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return json(route, rows);
  });
}

function forYouRow(n: number, title: string, price: string | null) {
  return {
    id: `30000000-0000-0000-0000-00000000000${n}`,
    title,
    date: `2026-10-0${n}T23:00:00Z`,
    event_start_utc: `2026-10-0${n}T23:00:00Z`,
    category: n === 1 ? 'Nightlife' : 'Music',
    image_url: null,
    venue: n === 1 ? 'Fixture Pub' : 'Fixture Park',
    location: 'Des Moines',
    city: 'Des Moines',
    price,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    trending_score: null,
  };
}

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

const FIXTURE_ISO = '2026-01-01T00:00:00Z';

/** Three of each, so every dashboard group has a full three-card slot to fill. */
const OPENINGS = [0, 1, 2].map((i) => ({
  id: `41000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  name: `CLS Opening ${i}`,
  slug: `cls-opening-${i}`,
  description: 'An opening supplied by tests/home-rails-cls.spec.ts.',
  cuisine: 'American',
  price_range: '$$',
  city: 'Des Moines',
  image_url: null,
  rating: null,
  is_featured: false,
  latitude: 41.58,
  longitude: -93.62,
  created_at: FIXTURE_ISO,
  updated_at: FIXTURE_ISO,
  data_quality_score: 80,
  enhanced: false,
  google_place_id: null,
  is_merged: false,
  is_sponsored: false,
  sponsored_until: null,
  location: 'East Village',
  merged_at: null,
  merged_into: null,
  opening: true,
  opening_date: '2026-11-01',
  opening_timeframe: null,
  phone: null,
  popularity_score: 0,
  source_url: 'https://example.com/opening',
  status: 'opening_soon',
  website: null,
  writeup_generated_at: null,
}));

const PLAYGROUNDS = [0, 1, 2].map((i) => ({
  id: `51000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  name: `CLS Playground ${i}`,
  description: 'A playground supplied by tests/home-rails-cls.spec.ts.',
  location: 'Des Moines, IA',
  age_range: '2-12',
  image_url: null,
  rating: null,
  is_featured: false,
  latitude: 41.58,
  longitude: -93.62,
  created_at: FIXTURE_ISO,
  updated_at: FIXTURE_ISO,
  accessibility_notes: null,
  amenities: [],
  has_restrooms: true,
  has_shade: true,
  source: 'manual',
  surface_type: null,
}));

const HOTELS = [0, 1, 2].map((i) => ({
  id: `61000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  name: `CLS Hotel ${i}`,
  slug: `cls-hotel-${i}`,
  address: `${300 + i} Locust St`,
  affiliate_provider: null,
  affiliate_url: null,
  affiliate_url_updated_at: null,
  amenities: [],
  area: 'Downtown',
  avg_nightly_rate: null,
  brand_parent: null,
  chain_name: null,
  check_in_time: null,
  check_out_time: null,
  city: 'Des Moines',
  created_at: FIXTURE_ISO,
  description: 'A hotel supplied by tests/home-rails-cls.spec.ts.',
  email: null,
  google_place_id: null,
  hotel_type: 'Hotel',
  image_url: null,
  is_active: true,
  is_featured: false,
  latitude: 41.58,
  longitude: -93.62,
  phone: null,
  price_range: '$$',
  short_description: null,
  sort_order: i,
  star_rating: null,
  state: 'IA',
  total_rooms: null,
  updated_at: FIXTURE_ISO,
  website: null,
  zip: '50309',
}));

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

test.describe('home rails (WP2, pass-2 WP3)', () => {
  test('empty For You read + late weather: the rail keeps its height', async ({ page }) => {
    await installFixtureBackend(page);
    await delayWeather(page, 3000);
    await routeForYou(page, [], 1500);
    await installShiftObserver(page, RAIL);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RAIL);
    await expect(rail).toBeVisible({ timeout: 30_000 });
    const before = await rail.boundingBox();

    // Empty state, not a collapse.
    await expect(rail.getByText('Nothing is listed yet.')).toBeVisible({ timeout: 10_000 });
    await expect(rail.getByRole('link', { name: "See what's on today" })).toHaveAttribute(
      'href',
      '/events/today',
    );
    // Let the held-back weather land too.
    await page.waitForTimeout(3500);
    const after = await rail.boundingBox();

    expect(before?.height).toBeGreaterThan(0);
    expect(after?.height).toBe(before?.height);
    // The weather line moved to the Tonight rail (pass-2 WP2 item 6).
    await expect(rail.locator('[data-rail-weather-line]')).toHaveCount(0);

    const shift = await page.evaluate(() => (window as unknown as { __railShift: number }).__railShift);
    expect(shift).toBeLessThan(0.05);
  });

  test('a guest who taps Free sees "For you" and a reason on the card', async ({ page }) => {
    await installFixtureBackend(page);
    await routeForYou(page, [
      forYouRow(1, 'Trivia Night', '$5'),
      forYouRow(2, 'Concert on the Lawn', 'Free'),
    ]);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RAIL);
    // No trending scores: the rows are the next events by date.
    await expect(rail.getByRole('heading', { name: 'Coming up' })).toBeVisible({ timeout: 30_000 });

    const free = rail.getByRole('button', { name: 'Free', exact: true });
    await expect(free).toHaveAttribute('aria-pressed', 'false');
    await free.click();

    await expect(free).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.getByRole('heading', { name: 'For you' })).toBeVisible();
    await expect(rail.getByText('Because you picked Free')).toBeVisible();
    // The matching card moved to the front, decided by its price.
    await expect(rail.locator('a[href^="/events/"]').first()).toContainText('Concert on the Lawn');
  });

  test('a pick nothing matches says so and keeps the plain heading', async ({ page }) => {
    await installFixtureBackend(page);
    await routeForYou(page, [forYouRow(1, 'Trivia Night', '$5'), forYouRow(2, 'Concert on the Lawn', '$20')]);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RAIL);
    await expect(rail.getByRole('heading', { name: 'Coming up' })).toBeVisible({ timeout: 30_000 });
    await rail.getByRole('button', { name: 'Family', exact: true }).click();

    await expect(rail.getByText('Nothing coming up matches Family yet.')).toBeVisible();
    await expect(rail.getByRole('link', { name: 'See kids and family events' })).toHaveAttribute('href', '/events/kids');
    await expect(rail.getByRole('heading', { name: 'For you' })).toHaveCount(0);
  });

  test('dashboard groups fill their own slots when tables answer at 0, 1s and 3s', async ({ page }) => {
    await installFixtureBackend(page);
    // Every group gets rows. The fixture backend answers the openings read
    // with ordinary restaurants (no opening status), playgrounds and hotels
    // with nothing, and For You with the same events the dashboard would
    // show, so four of five groups correctly gave up their slots as their
    // answers landed, and whether that collapse moved a group on screen
    // depended on where the scroll loop stopped. That measured scroll timing,
    // not slot reservation.
    await page.route('**/rest/v1/restaurants?*', (route) =>
      decodeURIComponent(route.request().url()).includes('opening_soon') ? json(route, OPENINGS) : route.fallback(),
    );
    await page.route('**/rest/v1/playgrounds?*', (route) => json(route, PLAYGROUNDS));
    await page.route('**/rest/v1/hotels?*', (route) => json(route, HOTELS));
    await routeForYou(page, []);
    // Registered last, so the delay runs first and then falls back to the rows.
    const delays: Record<string, number> = { restaurants: 1000, attractions: 3000, playgrounds: 1000, hotels: 3000 };
    for (const [table, ms] of Object.entries(delays)) {
      await page.route(`**/rest/v1/${table}?*`, async (route) => {
        await new Promise((r) => setTimeout(r, ms));
        return route.fallback();
      });
    }
    await installShiftObserver(page, DASHBOARD);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const heading = page.getByRole('heading', { name: 'Explore Des Moines' });
    for (let i = 0; i < 30 && !(await heading.isVisible()); i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(150);
    }
    await expect(heading).toBeVisible({ timeout: 30_000 });
    // Let the slowest table land.
    await page.waitForTimeout(4000);
    await expect(page.locator(`${DASHBOARD} [aria-busy="true"]`)).toHaveCount(0);
    // Each group filled its slot rather than giving it up.
    for (const kind of ['event', 'restaurant', 'attraction', 'playground', 'hotel']) {
      await expect(page.locator(`${DASHBOARD} section[aria-labelledby="dashboard-group-${kind}"] li`).first()).toBeVisible();
    }

    const shift = await page.evaluate(() => (window as unknown as { __railShift: number }).__railShift);
    expect(shift).toBeLessThan(0.05);
  });

  test('recently viewed with 3 entries is there at first paint and does not move', async ({ page }) => {
    await installFixtureBackend(page);
    await page.addInitScript(() => {
      const now = Date.now();
      const entries = [1, 2, 3].map((i) => ({
        id: `e${i}`,
        type: 'event',
        title: `Seeded event ${i}`,
        href: `/events/seeded-event-${i}-2026-10-01`,
        viewedAt: now - i * 1000,
      }));
      try {
        window.localStorage.setItem('dmi_recently_viewed_v1', JSON.stringify(entries));
      } catch {
        // storage blocked; the rail will not render and the test fails loudly
      }
    });
    const RECENT = 'section[aria-labelledby="recently-viewed-heading"]';
    await installShiftObserver(page, RECENT);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator(RECENT);
    await expect(rail).toBeVisible({ timeout: 30_000 });
    const before = await rail.boundingBox();
    await page.waitForTimeout(3000);
    const after = await rail.boundingBox();
    expect(after?.height).toBe(before?.height);

    const shift = await page.evaluate(() => (window as unknown as { __railShift: number }).__railShift);
    expect(shift).toBeLessThan(0.05);
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
