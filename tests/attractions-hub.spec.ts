import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP3: /attractions and /attractions/:slug.
 *
 * 1. A comma in the search box no longer 400s the list into ErrorState. The
 *    attractions route below answers 400 the way PostgREST does when or(...)
 *    does not split into its four clauses, so the old unsanitized query fails
 *    here exactly as it failed in production.
 * 2. ?free=1&kids=1 sends is_free=eq.true and is_kid_friendly=eq.true.
 * 3. The map toggle writes ?view=map, shows a local 600px skeleton while the
 *    chunk loads (the page around it stays up), and never asks unpkg.com for
 *    marker images.
 * 4. The detail page reads attractions.hours JSONB at a fixed clock, shows no
 *    template claims, and never fetches venues?select=*.
 *
 * Table overrides are registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const NINE_TO_FIVE = { open: '09:00', close: '17:00' };

function attraction(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `31000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Hub Fixture Attraction ${i}`,
    description: 'An attraction supplied by attractions-hub.spec.ts.',
    type: i % 2 === 0 ? 'Museum' : 'Park',
    location: '100 Fixture St, Des Moines, IA',
    address: null,
    image_url: null,
    rating: 4.25,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58 + i * 0.001,
    longitude: -93.62,
    website: 'https://example.com/fixture',
    hours_summary: null,
    hours: null,
    is_indoor: i % 2 === 0,
    is_kid_friendly: true,
    is_free: i % 3 === 0,
    is_active: true,
    accessibility_notes: null,
    geo_summary: null,
    created_at: ISO,
    updated_at: ISO,
    ...extra,
  };
}

const HOURS_ROW = attraction(99, {
  name: 'Hours Fixture Museum',
  type: 'Museum',
  is_free: false,
  is_indoor: true,
  hours: {
    mon: NINE_TO_FIVE,
    tue: NINE_TO_FIVE,
    wed: NINE_TO_FIVE,
    thu: NINE_TO_FIVE,
    fri: NINE_TO_FIVE,
    sat: { open: '10:00', close: '16:00' },
    sun: null,
  },
  accessibility_notes: 'Step-free entrance on the north side.',
});

const headers = { 'access-control-allow-origin': '*' };

function fulfilRows(route: Route, rows: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

/**
 * The attractions table, with PostgREST's or(...) parse rule: four clauses
 * or a 400. Records every request URL so a spec can assert on the filters.
 */
async function installAttractions(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/attractions**', (route) => {
    const url = new URL(route.request().url());
    seen.push(url.toString());
    const or = url.searchParams.get('or');
    if (or !== null) {
      const inner = or.replace(/^\(/, '').replace(/\)$/, '');
      if (inner.split(',').length !== 4) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ code: 'PGRST100', message: 'failed to parse logic tree' }),
        });
      }
      return fulfilRows(route, []);
    }
    if ((url.searchParams.get('slug') ?? '').includes('hours-fixture-museum')) {
      return fulfilRows(route, [HOURS_ROW]);
    }
    // The detail page's related rails; the hub list.
    if (url.searchParams.has('slug')) return fulfilRows(route, []);
    return fulfilRows(route, Array.from({ length: 6 }, (_, i) => attraction(i)));
  });
  return seen;
}

test.describe('attractions hub (Explore WP3)', () => {
  test('a comma in the search shows results or the empty state, not ErrorState', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installAttractions(page);

    await page.goto('/attractions?q=Ankeny,%20IA');
    await expect(page.getByRole('heading', { name: /No results for/i })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    expect(seen.some((u) => new URL(u).searchParams.has('or'))).toBe(true);
  });

  test('Free and Kid-friendly go to the server as column filters', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installAttractions(page);

    await page.goto('/attractions?free=1&kids=1');
    await expect(page.getByRole('button', { name: 'Free', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Kid-friendly', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(() =>
        seen.some((u) => {
          const p = new URL(u).searchParams;
          return p.get('is_free') === 'eq.true' && p.get('is_kid_friendly') === 'eq.true';
        }),
      )
      .toBe(true);

    // Toggling Indoors adds its own filter and keeps the other two in the URL.
    await page.getByRole('button', { name: 'Indoors', exact: true }).click();
    await expect(page).toHaveURL(/indoor=1/);
    await expect(page).toHaveURL(/free=1/);
    await expect(page).toHaveURL(/kids=1/);
  });

  test('pagination links carry a real href', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/attractions**', (route) =>
      fulfilRows(route, Array.from({ length: 40 }, (_, i) => attraction(i))),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/attractions?free=1');
    const two = page.getByRole('navigation', { name: /pagination/i }).getByRole('link', { name: '2', exact: true });
    await expect(two).toHaveAttribute('href', /page=2/);
    await expect(two).toHaveAttribute('href', /free=1/);
  });

  test('the map toggle shows a local skeleton, syncs ?view=map and never calls unpkg', async ({ page }) => {
    await installFixtureBackend(page);
    await installAttractions(page);
    const unpkg: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('unpkg.com')) unpkg.push(r.url());
    });
    await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 204, body: '' }));
    // Hold the lazy map chunk so the skeleton is observable.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/AttractionsMap[^/]*\.(js|tsx)(\?.*)?$/, async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto('/attractions');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to map view' }).click();

    await expect(page).toHaveURL(/view=map/);
    const skeleton = page.getByRole('status', { name: 'Loading map' });
    await expect(skeleton).toBeVisible();
    const box = await skeleton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(590);
    // The page around the map stayed mounted.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    release();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
    expect(unpkg).toEqual([]);
  });
});

test.describe('attraction detail (Explore WP3)', () => {
  test('hours JSONB gives a status at a fixed clock, and no template claims render', async ({ page }) => {
    // Wednesday 2026-09-23, 10:00 AM in Des Moines.
    await page.clock.setFixedTime(new Date('2026-09-23T15:00:00Z'));
    await installFixtureBackend(page);
    await installAttractions(page);
    const venuesStar: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/\/rest\/v1\/venues\?/.test(u) && /select=\*/.test(decodeURIComponent(u))) venuesStar.push(u);
    });

    await page.goto('/attractions/hours-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Hours Fixture Museum' })).toBeVisible();

    await expect(page.getByText('Open until 5 PM')).toBeVisible();
    const today = page.locator('tr[aria-current="date"]');
    await expect(today).toContainText('Wednesday');
    await expect(today).toContainText('9 AM - 5 PM');
    await expect(page.getByText('Step-free entrance on the north side.')).toBeVisible();
    await expect(page.getByText(/Paid admission/)).toBeVisible();

    const body = page.locator('body');
    await expect(body).not.toContainText('Solo Travelers');
    await expect(body).not.toContainText('must-visit');
    await expect(body).not.toContainText('by visitors');
    expect(venuesStar).toEqual([]);
  });

  test('a row with only hours_summary shows that text', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/attractions**', (route) => {
      const url = new URL(route.request().url());
      if ((url.searchParams.get('slug') ?? '').includes('summary-fixture-park')) {
        return fulfilRows(route, [
          attraction(98, { name: 'Summary Fixture Park', hours_summary: 'Dawn to dusk, seasonal' }),
        ]);
      }
      return fulfilRows(route, []);
    });

    await page.goto('/attractions/summary-fixture-park');
    await expect(page.getByRole('heading', { level: 1, name: 'Summary Fixture Park' })).toBeVisible();
    await expect(page.getByText('Dawn to dusk, seasonal').first()).toBeVisible();
  });
});
