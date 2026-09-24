import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP4: /playgrounds and /playgrounds/:slug.
 *
 * The fixture backend does not filter (on purpose, see fixtureBackend.ts), so
 * these assert what the page ASKS for - the PostgREST params on the request -
 * and how the UI reacts, not which rows a real filter would return.
 *
 *  1. ?shade=1 sends has_shade=eq.true and every list query is metro-bounded.
 *  2. The Location dropdown lists only suburbs read from the rows, with
 *     counts, and none of the old hardcoded slugs.
 *  3. Amenity chips are a pressed/unpressed multi-select stored in ?amenity=
 *     and sent as a contains() filter.
 *  4. Pressing Map keeps the hero and filters on screen and writes ?view=map.
 *  5. Near me: a denied position shows an inline message; a granted one sorts
 *     by distance and shows "mi away".
 *  6. The detail page's side lists are bounded and explicit, render no
 *     "Playground Not Found", and nothing says "dawn to dusk".
 *
 * playgrounds is overridden with page.route AFTER installFixtureBackend, which
 * the fixture documents as the way to win the match.
 */

const ROWS = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Fixture Ankeny Playground',
    location: '123 Main St, Ankeny, IA 50023, USA',
    latitude: 41.73,
    longitude: -93.6,
    age_range: '2-5',
    amenities: ['Splash Pad', 'Swings'],
    has_shade: true,
    has_restrooms: null,
    surface_type: null,
    accessibility_notes: null,
    description: 'A playground supplied by tests/playgrounds-hub.spec.ts.',
    image_url: null,
    is_featured: false,
    rating: null,
    source: 'manual',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    name: 'Fixture Downtown Playground',
    location: '400 Locust St, Des Moines, IA 50309',
    latitude: 41.5868,
    longitude: -93.625,
    age_range: '5-12',
    amenities: ['Swings'],
    has_shade: false,
    has_restrooms: true,
    surface_type: 'Rubber',
    accessibility_notes: 'Ramp to the main deck.',
    description: 'Another fixture playground.',
    image_url: null,
    is_featured: true,
    rating: 4.5,
    source: 'manual',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    name: 'Fixture Clive Playground',
    location: '12 Elm St, Clive IA 50325',
    latitude: 41.6,
    longitude: -93.78,
    age_range: '2-5',
    amenities: [],
    has_shade: null,
    has_restrooms: null,
    surface_type: null,
    accessibility_notes: null,
    description: null,
    image_url: null,
    is_featured: false,
    rating: 3.9,
    source: 'manual',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const CORS = { 'access-control-allow-origin': '*' };

/** Answer every playgrounds request from ROWS and record its URL. */
async function installPlaygrounds(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/playgrounds**', (route: Route) => {
    const req = route.request();
    const url = decodeURIComponent(req.url());
    seen.push(url);
    const wantsObject = (req.headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (req.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${ROWS.length}` }, body: '' });
    }
    if (wantsObject) {
      // Slug or id lookup for the detail page: the Downtown row.
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        headers: CORS,
        body: JSON.stringify(ROWS[1]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'content-range': `0-${ROWS.length - 1}/${ROWS.length}` },
      body: JSON.stringify(ROWS),
    });
  });
  return seen;
}

/** Replace navigator.geolocation before the app boots. */
async function stubGeolocation(page: Page, mode: 'deny' | 'grant') {
  await page.addInitScript((m) => {
    const geo = {
      getCurrentPosition(ok: PositionCallback, fail?: PositionErrorCallback | null) {
        setTimeout(() => {
          if (m === 'deny') {
            fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
          } else {
            ok({
              coords: { latitude: 41.5868, longitude: -93.625, accuracy: 50 },
              timestamp: Date.now(),
            } as unknown as GeolocationPosition);
          }
        }, 10);
      },
      watchPosition() {
        return 0;
      },
      clearWatch() {},
    };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  }, mode);
}

const listRequests = (seen: string[]) =>
  seen.filter((u) => !u.includes('select=age_range,location,amenities') && !u.includes('slug=eq.'));

test.describe('/playgrounds hub (explore WP4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('?shade=1 sends has_shade=eq.true, metro-bounded, list projection', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds?shade=1');
    await expect(page.getByTestId('playground-grid')).toBeVisible();

    const list = listRequests(seen);
    expect(list.length).toBeGreaterThan(0);
    const last = list[list.length - 1];
    expect(last).toContain('has_shade=eq.true');
    expect(last).toContain('latitude.is.null');
    expect(last).not.toContain('select=*');

    // The toggle reflects the URL.
    await expect(page.locator('[data-filter-toggle="shade"]').first()).toHaveAttribute('aria-pressed', 'true');
    // The card chip renders only for has_shade=true.
    await expect(page.getByTestId('playground-essentials').filter({ hasText: 'Shade' })).toHaveCount(1);
  });

  test('Location lists only suburbs read from the rows, with counts', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.getByTestId('playground-grid')).toBeVisible();

    // The facets query is bounded like the list.
    const facets = seen.filter((u) => u.includes('select=age_range,location,amenities'));
    expect(facets.length).toBeGreaterThan(0);
    expect(facets[0]).toContain('latitude.gte.');

    await page.locator('#pg-desktop-location').click();
    const options = page.getByRole('option');
    await expect(options.filter({ hasText: 'Ankeny (1)' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Clive (1)' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Des Moines (1)' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Downtown' })).toHaveCount(0);
    await expect(options.filter({ hasText: 'IA 5' })).toHaveCount(0);

    await options.filter({ hasText: 'Ankeny (1)' }).click();
    await expect(page).toHaveURL(/location=Ankeny/);
    const last = listRequests(seen).at(-1) ?? '';
    expect(last).toContain('location=ilike.%Ankeny%');
  });

  test('amenity chips toggle ?amenity= and send contains()', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds');
    const chip = page.getByTestId('amenity-chips').getByRole('button', { name: /Splash Pad/ });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/amenity=Splash(\+|%20)Pad/);
    await expect.poll(() => listRequests(seen).at(-1) ?? '').toContain('amenities=cs.{"Splash Pad"}');
    // It no longer types into the search box.
    await expect(page.getByRole('searchbox', { name: 'Search playgrounds' })).toHaveValue('');
  });

  test('Map keeps hero and filters on screen and writes ?view=map', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.getByTestId('playground-grid')).toBeVisible();

    await page.getByRole('button', { name: 'Switch to map view' }).click();
    await expect(page).toHaveURL(/view=map/);
    await expect(page.getByRole('heading', { level: 1, name: /Discover Des Moines Playgrounds/ })).toBeVisible();
    await expect(page.getByTestId('playground-filters')).toBeVisible();
    // Either the 600px skeleton or the map itself holds the space.
    await expect(
      page.getByTestId('playgrounds-map-skeleton').or(page.locator('.leaflet-container')).first(),
    ).toBeVisible();
  });

  test('Near me denied shows an inline message', async ({ page }) => {
    await stubGeolocation(page, 'deny');
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.getByTestId('playground-grid')).toBeVisible();
    await page.getByRole('button', { name: /Near me/ }).click();
    await expect(page.getByTestId('near-me-error')).toContainText('permission denied');
  });

  test('Near me granted sorts by distance', async ({ page }) => {
    await stubGeolocation(page, 'grant');
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.getByTestId('playground-grid')).toBeVisible();
    await page.getByRole('button', { name: /Near me/ }).click();
    const first = page.getByTestId('playground-grid').locator('a').first();
    await expect(first).toContainText('Fixture Downtown Playground');
    await expect(first.getByTestId('playground-distance')).toContainText('mi away');
  });
});

test.describe('/playgrounds/:slug (explore WP4)', () => {
  test('side lists are bounded and explicit, no unbacked claims', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();

    // Parent essentials read the columns; null says so.
    const essentials = page.getByTestId('playground-essentials');
    await expect(essentials).toContainText('Rubber');
    await expect(essentials).toContainText('Ramp to the main deck.');

    await expect.poll(() => seen.some((u) => u.includes('longitude=gte.'))).toBe(true);
    const nearby = seen.find((u) => u.includes('longitude=gte.')) ?? '';
    expect(nearby).toContain('order=rating.desc.nullslast');
    expect(nearby).not.toContain('select=*');

    await expect(page.getByTestId('playground-side-card').first()).toBeVisible();
    await expect(page.getByText('Playground Not Found')).toHaveCount(0);
    await expect(page.getByText(/dawn to dusk/i)).toHaveCount(0);
    await expect(page.getByText('Good For')).toHaveCount(0);
  });
});
