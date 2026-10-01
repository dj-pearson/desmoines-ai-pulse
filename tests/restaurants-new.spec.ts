import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Openings, "new" and the restaurant card (docs/page-plans/eat-drink-pass2.md,
 * WP2 items 5-8).
 *
 * - /restaurants/new files a stale announcement (opening_soon, dated
 *   2025-06-15) under "Announced, not confirmed", never under "Opening soon".
 * - Each opening carries a Source link from source_url; a javascript: URL is
 *   not rendered as one.
 * - "N added since your last visit" reads a timestamp the page stored on the
 *   previous visit.
 * - The hub's openings watch lists the place that opened last week first and
 *   leaves the stale announcement out.
 * - A card whose row was created yesterday but opened in 2019 shows no "new"
 *   line, and no card says "Popular" or "Featured".
 * - Under the build-time prerender flag the hub cards carry no "Open until".
 *
 * RUNS AGAINST FIXTURES. Dates are computed from today's Central date, so the
 * rows stay "last week" and "next month" whenever this runs.
 */

const DAY_MS = 86_400_000;

function centralDate(offsetDays = 0): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
    new Date(Date.now() + offsetDays * DAY_MS),
  );
}

const YESTERDAY_ISO = new Date(Date.now() - DAY_MS).toISOString();
const LONG_AGO_ISO = '2024-01-01T00:00:00Z';

function row(i: number, name: string, fields: Record<string, unknown>) {
  return {
    id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: 'A row supplied by tests/restaurants-new.spec.ts.',
    cuisine: 'American',
    price_range: '$$',
    city: 'Des Moines',
    image_url: null,
    rating: 4.5,
    is_featured: true,
    latitude: 41.58,
    longitude: -93.62,
    created_at: LONG_AGO_ISO,
    updated_at: LONG_AGO_ISO,
    data_quality_score: 80,
    enhanced: false,
    google_place_id: null,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    location: 'East Village',
    merged_at: null,
    merged_into: null,
    opening: null,
    opening_date: null,
    opening_timeframe: null,
    phone: null,
    popularity_score: 95,
    source_url: null,
    status: 'open',
    website: null,
    writeup_generated_at: null,
    ...fields,
  };
}

const FRESH = row(1, 'Fresh Noodle Bar', {
  status: 'newly_opened',
  opening_date: centralDate(-7),
  created_at: YESTERDAY_ISO,
  source_url: 'https://www.example.com/fresh-noodle',
});
const STALE = row(2, 'Stale Promise Cafe', {
  status: 'opening_soon',
  opening_date: '2025-06-15',
  source_url: 'javascript:alert(1)',
});
const NEXT = row(3, 'Next Month Tacos', {
  status: 'opening_soon',
  opening_date: centralDate(30),
  source_url: 'https://news.example.org/tacos',
});
/** Imported yesterday, open since 2019, open around the clock. */
const OLD_FAVORITE = row(4, 'Old Favorite Diner', {
  status: 'open',
  opening_date: '2019-05-01',
  created_at: YESTERDAY_ISO,
  opening: 'Daily 12am-11:59pm',
});

function json(route: Route, rows: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    },
    body: JSON.stringify(rows),
  });
}

/** The cookie banner sits over the bottom of the page; a stored decision keeps it closed. */
async function seedConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
}

async function openNewPage(page: Page, lastVisit?: string) {
  await seedConsent(page);
  if (lastVisit) {
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem('restaurantsNewLastVisit', value);
      } catch {
        // Storage blocked: the since-last-visit assertion fails loudly.
      }
    }, lastVisit);
  }
  await installFixtureBackend(page);
  // Registered after the fixture backend, so it wins for the restaurants table.
  await page.route('**/rest/v1/restaurants?*', (route) => json(route, [FRESH, STALE, NEXT, OLD_FAVORITE]));
  await page.goto('/restaurants/new');
  await expect(page.getByRole('heading', { name: /^Recently opened/ })).toBeVisible({ timeout: 30_000 });
}

async function openHub(page: Page, { prerender = false } = {}) {
  await seedConsent(page);
  if (prerender) {
    await page.addInitScript(() => {
      (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
  }
  await installFixtureBackend(page);
  await page.route('**/rest/v1/rpc/get_rotated_restaurants', (route) =>
    json(route, [OLD_FAVORITE].map((r) => ({ restaurant_data: r, total_count: 1 }))),
  );
  await page.route('**/rest/v1/restaurants?*', (route) => {
    const url = decodeURIComponent(route.request().url());
    // Only the openings watch names opening_soon. The fixture does not filter,
    // so the stale row reaches the browser and the client has to drop it.
    return url.includes('opening_soon') ? json(route, [STALE, FRESH]) : route.fallback();
  });
  await page.goto('/restaurants');
  const card = page.locator('article', { has: page.getByRole('link', { name: 'Old Favorite Diner' }) }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

test.describe('/restaurants/new', () => {
  test('files a stale announcement under "Announced, not confirmed"', async ({ page }) => {
    await openNewPage(page);

    const upcoming = page.locator('section[aria-labelledby="upcoming-heading"]');
    await expect(upcoming.getByRole('link', { name: 'Next Month Tacos' })).toBeVisible();
    await expect(upcoming.getByText('Stale Promise Cafe')).toHaveCount(0);

    const unconfirmed = page.locator('section[aria-labelledby="unconfirmed-heading"]');
    await expect(unconfirmed.getByRole('heading', { name: /Announced, not confirmed/ })).toBeVisible();
    const staleCard = unconfirmed.locator('article', { hasText: 'Stale Promise Cafe' });
    await expect(staleCard).toContainText('Announced for Jun 15, 2025, not confirmed');

    const recent = page.locator('section[aria-labelledby="recent-heading"]');
    await expect(recent.locator('article', { hasText: 'Fresh Noodle Bar' })).toContainText(/Opened [A-Z][a-z]{2} \d{1,2}/);
    // Opened in 2019: not in the past year, whatever created_at says.
    await expect(page.getByText('Old Favorite Diner')).toHaveCount(0);
  });

  test('each opening links its source, and only over http(s)', async ({ page }) => {
    await openNewPage(page);

    const fresh = page.locator('article', { hasText: 'Fresh Noodle Bar' });
    const source = fresh.getByRole('link', { name: /^Source: example\.com$/ });
    await expect(source).toHaveAttribute('href', 'https://www.example.com/fresh-noodle');
    await expect(source).toHaveAttribute('target', '_blank');

    await expect(page.locator('article', { hasText: 'Next Month Tacos' }).getByRole('link', { name: /^Source:/ })).toHaveAttribute(
      'href',
      'https://news.example.org/tacos',
    );
    await expect(page.locator('article', { hasText: 'Stale Promise Cafe' }).getByRole('link', { name: /^Source:/ })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('says how many places were added since the last visit, and stores this one', async ({ page }) => {
    const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString();
    await openNewPage(page, threeDaysAgo);

    // FRESH was created yesterday; the rest long ago.
    await expect(page.getByText(/^1 place added since your last visit on [A-Z][a-z]{2} \d{1,2}\.$/)).toBeVisible();

    const stored = await page.evaluate(() => window.localStorage.getItem('restaurantsNewLastVisit'));
    expect(stored).not.toBe(threeDaysAgo);
    expect(Date.parse(stored ?? '')).toBeGreaterThan(Date.now() - 60_000);
  });

  test('says nothing about a last visit on the first one', async ({ page }) => {
    await openNewPage(page);
    await expect(page.getByText(/since your last visit/)).toHaveCount(0);
  });

  test('the Save button is a 44px target', async ({ page }) => {
    await openNewPage(page);
    const save = page.locator('article', { hasText: 'Fresh Noodle Bar' }).getByRole('button', { name: /^Save / });
    const box = await save.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('/restaurants hub card and openings watch', () => {
  test('the watch lists the new opening first and leaves the stale one out', async ({ page }) => {
    await openHub(page);
    const watch = page.locator('section[aria-labelledby="openings-watch-heading"]');
    await expect(watch.getByRole('listitem').first()).toContainText('Fresh Noodle Bar', { timeout: 30_000 });
    await expect(watch.getByText('Stale Promise Cafe')).toHaveCount(0);
  });

  test('a row imported yesterday that opened in 2019 is not new, popular or featured', async ({ page }) => {
    const card = await openHub(page);
    await expect(card).not.toContainText(/New This Week|Opened|Popular|Featured/);
    // Control for the prerender test below: live, the hours line is there.
    await expect(card).toContainText(/Open until|Closes at/);
    await expect(card).toContainText('Google');
  });

  test('the prerendered card carries no live open status', async ({ page }) => {
    const card = await openHub(page, { prerender: true });
    await expect(card).not.toContainText(/Open until|Closes at|Closed, opens/);
  });
});
