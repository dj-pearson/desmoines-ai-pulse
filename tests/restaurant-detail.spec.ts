/**
 * Restaurant detail page (restaurants plan WP8).
 *
 * Runs against tests/support/fixtureBackend.ts, with the restaurants table
 * overridden per test so each case gets the one row it is about. What these
 * pin:
 *   - a scraped `javascript:` website never becomes a link;
 *   - a permanently closed place shows a notice, no Reserve/Call, no Open badge,
 *     and is noindexed;
 *   - a merged row redirects to the row it was merged into;
 *   - nearby events ask PostgREST to leave out hidden and archived rows, and
 *     "View Details" on one lands on /events/...;
 *   - a backend error shows a retry state, not "not found", and no noindex.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const ID = '55555555-5555-4555-8555-555555555555';
const SURVIVOR_ID = '66666666-6666-4666-8666-666666666666';

const BASE = {
  id: ID,
  name: 'Fixture Supper Club',
  slug: 'fixture-supper-club',
  phone: '515-555-0100',
  website: 'https://example.com/supper',
  location: '400 Locust St, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'American',
  description: 'A restaurant supplied by tests/restaurant-detail.spec.ts.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.5,
  price_range: '$$',
  opening: 'Daily 11am-10pm',
  status: 'open',
  is_merged: false,
  merged_into: null,
  reservable: true,
  reservation_url: 'https://www.opentable.com/r/fixture',
  reservation_provider: 'opentable',
  updated_at: '2026-01-01T00:00:00Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

/**
 * The detail read, and the merge-target lookup, answered from `rows`.
 * Registered after installFixtureBackend so it wins for restaurants reads;
 * list reads (related, nearby) get [] so the rails stay quiet.
 */
async function serveRestaurants(page: Page, rows: Array<Record<string, unknown>>) {
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    const hit = rows.find(
      (r) => url.includes(`slug=eq.${r.slug}`) || url.includes(`id=eq.${r.id}`),
    );
    return json(route, hit ? [hit] : []);
  });
}

test.describe('restaurant detail', () => {
  test('a javascript: website renders no link', async ({ page }) => {
    await installFixtureBackend(page);
    await serveRestaurants(page, [
      { ...BASE, website: 'javascript:alert(1)', reservation_url: 'javascript:alert(2)', reservable: null },
    ]);
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Website$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Reserve a table/i })).toHaveCount(0);
  });

  test('a bare hostname website becomes an https link', async ({ page }) => {
    await installFixtureBackend(page);
    await serveRestaurants(page, [{ ...BASE, website: 'www.example.com' }]);
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page.getByRole('link', { name: /^Website$/ }).first()).toHaveAttribute(
      'href',
      'https://www.example.com/',
    );
  });

  test('a permanently closed place shows a notice and no open claims', async ({ page }) => {
    await installFixtureBackend(page);
    await serveRestaurants(page, [{ ...BASE, status: 'permanently_closed', opening: '24 hours' }]);
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page.getByText(/has closed permanently/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Reserve a table/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Call$/ })).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.getByText(/^Open Now$/)).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  });

  test('a merged row redirects to the restaurant it was merged into', async ({ page }) => {
    await installFixtureBackend(page);
    await serveRestaurants(page, [
      { ...BASE, is_merged: true, merged_into: SURVIVOR_ID },
      { ...BASE, id: SURVIVOR_ID, slug: 'fixture-survivor', name: 'Fixture Survivor' },
    ]);
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page).toHaveURL(/\/restaurants\/fixture-survivor$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Survivor' })).toBeVisible();
  });

  test('nearby events exclude hidden and archived rows and link to the event', async ({ page }) => {
    await installFixtureBackend(page);
    await serveRestaurants(page, [BASE]);
    const eventQueries: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/events')) eventQueries.push(decodeURIComponent(req.url()));
    });
    await page.goto(`/restaurants/${BASE.slug}`);

    // Either rail may render (tonight's, or the any-date fallback), and both
    // must carry the three unpublish filters.
    await expect.poll(() => eventQueries.length).toBeGreaterThan(0);
    for (const q of eventQueries) {
      expect(q).toContain('is_hidden=neq.true');
      expect(q).toContain('archived_at=is.null');
      expect(q).toContain('is_merged=neq.true');
    }

    const viewDetails = page.getByRole('button', { name: 'View Details' }).first();
    if (await viewDetails.count()) {
      await viewDetails.click();
      await expect(page).toHaveURL(/\/events\//);
    } else {
      const tonightLink = page.locator('section[aria-labelledby="tonight-nearby"] a[href^="/events/"]').first();
      await expect(tonightLink).toBeVisible();
    }
  });

  test('a backend error shows retry, not not-found, and no noindex', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/restaurants*', (route) =>
      json(route, { code: 'XX000', message: 'fixture outage' }, 500),
    );
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page.getByRole('button', { name: /Try again/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Restaurant Not Found/i)).toHaveCount(0);
    const robots = page.locator('meta[name="robots"]');
    const count = await robots.count();
    for (let i = 0; i < count; i++) {
      await expect(robots.nth(i)).not.toHaveAttribute('content', /noindex/);
    }
  });
});
