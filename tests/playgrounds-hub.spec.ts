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
 * Explore pass 2 WP4 adds:
 *  7. A result card is on the first 390x844 screen (item 6).
 *  8. "Des Moines" is a comma segment, not a substring: West Des Moines rows
 *     are not counted under it, and the request is the segment or() (item 9).
 *  9. Name A-Z by default; an error offers Try again (item 10).
 * 10. The Explore row and "Show on map" (item 11), and no Free, "by
 *     families", editors or "All ages welcome" on the hub.
 *
 * The detail page has its own spec now: tests/playground-detail.spec.ts.
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
  {
    // Pass 2 item 9: a substring match counted this row under "Des Moines".
    id: '30000000-0000-0000-0000-000000000004',
    name: 'Fixture Valley Junction Playground',
    location: '500 Grand Ave, West Des Moines, IA 50265',
    latitude: 41.57,
    longitude: -93.74,
    age_range: null,
    amenities: [],
    has_shade: null,
    has_restrooms: null,
    surface_type: null,
    accessibility_notes: null,
    description: null,
    image_url: null,
    is_featured: false,
    rating: 0,
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
    // supabase-js builds the query with URLSearchParams, which writes a space
    // as '+' (a literal plus is %2B), so '+' is decoded to a space here.
    const url = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    seen.push(url);
    const wantsObject = (req.headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (req.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${ROWS.length}` }, body: '' });
    }
    // maybeSingle() on a GET asks for a plain JSON array and errors client-side
    // (PGRST116) when it holds more than one row, so a slug or id lookup must
    // answer with exactly one.
    if (/[?&](slug|id)=eq\./.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ...CORS, 'content-range': '0-0/1' },
        body: JSON.stringify([ROWS[1]]),
      });
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
    await expect(page.locator('[data-playground-grid]')).toBeVisible();

    const list = listRequests(seen);
    expect(list.length).toBeGreaterThan(0);
    const last = list[list.length - 1];
    expect(last).toContain('has_shade=eq.true');
    expect(last).toContain('latitude.is.null');
    expect(last).not.toContain('select=*');

    // The toggle reflects the URL.
    await expect(page.locator('[data-filter-toggle="shade"]').first()).toHaveAttribute('aria-pressed', 'true');
    // The card chip renders only for has_shade=true.
    await expect(page.locator('[data-playground-essentials]').filter({ hasText: 'Shade' })).toHaveCount(1);
  });

  test('Location lists only suburbs read from the rows, with counts', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.locator('[data-playground-grid]')).toBeVisible();

    // The facets query is bounded like the list.
    const facets = seen.filter((u) => u.includes('select=age_range,location,amenities'));
    expect(facets.length).toBeGreaterThan(0);
    expect(facets[0]).toContain('latitude.gte.');

    await page.locator('#pg-desktop-location').click();
    const options = page.getByRole('option');
    await expect(options.filter({ hasText: 'Ankeny (1)' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Clive (1)' })).toHaveCount(1);
    // Two options, one row each: "Des Moines" no longer counts the West Des
    // Moines row as its own.
    await expect(options.filter({ hasText: /^Des Moines \(1\)$/ })).toHaveCount(1);
    await expect(options.filter({ hasText: /^West Des Moines \(1\)$/ })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Downtown' })).toHaveCount(0);
    await expect(options.filter({ hasText: 'IA 5' })).toHaveCount(0);

    await options.filter({ hasText: 'Ankeny (1)' }).click();
    await expect(page).toHaveURL(/location=Ankeny/);
    const last = listRequests(seen).at(-1) ?? '';
    // A comma segment, not location=ilike.%Ankeny%.
    expect(last).not.toContain('location=ilike.%Ankeny%');
    expect(last).toContain('location.ilike."%, Ankeny,%"');
    expect(last).toContain('location.ilike."%, Ankeny"');
  });

  test('amenity chips toggle ?amenity= and send contains()', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds');
    const chip = page.locator('[data-amenity-chips]').getByRole('button', { name: /Splash Pad/ });
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
    await expect(page.locator('[data-playground-grid]')).toBeVisible();

    await page.getByRole('button', { name: 'Switch to map view' }).click();
    await expect(page).toHaveURL(/view=map/);
    await expect(page.getByRole('heading', { level: 1, name: /Discover Des Moines Playgrounds/ })).toBeVisible();
    await expect(page.locator('[data-playground-filters]')).toBeVisible();
    // Either the 600px skeleton or the map itself holds the space.
    await expect(
      page.locator('[data-playgrounds-map-skeleton]').or(page.locator('.leaflet-container')).first(),
    ).toBeVisible();
  });

  test('Near me denied shows an inline message', async ({ page }) => {
    await stubGeolocation(page, 'deny');
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.locator('[data-playground-grid]')).toBeVisible();
    await page.getByRole('button', { name: /Near me/ }).click();
    await expect(page.locator('[data-near-me-error]')).toContainText('permission denied');
  });

  test('Near me granted sorts by distance', async ({ page }) => {
    await stubGeolocation(page, 'grant');
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.locator('[data-playground-grid]')).toBeVisible();
    await page.getByRole('button', { name: /Near me/ }).click();
    const first = page.locator('[data-playground-grid]').locator('a').first();
    await expect(first).toContainText('Fixture Downtown Playground');
    await expect(first.locator('[data-playground-distance]')).toContainText('mi away');
  });
});

test.describe('/playgrounds hub (explore pass 2 WP4)', () => {
  test('a result card is on the first 390x844 screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    const firstCard = page.locator('[data-playground-grid] a').first();
    await expect(firstCard).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(844);
    // Near me sits with the search box in the hero, not below the fold.
    const nearMe = page.getByRole('button', { name: /Near me/ });
    const nearBox = await nearMe.boundingBox();
    expect(nearBox!.y).toBeLessThan(box!.y);
  });

  test('name A-Z by default, with a Name / Near me control', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.locator('[data-playground-grid]')).toBeVisible();
    expect(listRequests(seen).at(-1) ?? '').toContain('order=name.asc');
    const sort = page.getByRole('group', { name: 'Sort playgrounds' });
    await expect(sort.getByRole('button', { name: 'Name' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sort.getByRole('button', { name: /Near me/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-playground-count]')).toContainText('A-Z');
    // One polite live region for the list: the count. The amenity summary
    // line no longer announces the same number a second time.
    await expect(page.locator('#playground-results [aria-live="polite"]')).toHaveCount(1);
    await page.locator('[data-amenity-chips]').getByRole('button', { name: /Swings/ }).click();
    await expect(page.getByText(/playgrounds have Swings/)).toBeVisible();
    await expect(page.locator('section:has([data-amenity-chips]) [aria-live]')).toHaveCount(0);
  });

  test('rating 0 renders as 0.0, not a stray "0"', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    const card = page.locator('[data-playground-grid] a', { hasText: 'Fixture Valley Junction Playground' });
    await expect(card).toContainText('0.0/5');
  });

  test('a failed list offers Try again, which refetches', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    // Registered last, so it runs first; falls back to installPlaygrounds.
    let fail = true;
    await page.route('**/rest/v1/playgrounds**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.includes('select=age_range,location,amenities')) return route.fallback();
      if (fail) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify({ code: 'PGRST100', message: 'fixture failure', details: null, hint: null }),
        });
      }
      return route.fallback();
    });
    await page.goto('/playgrounds');
    const alert = page.getByRole('alert').filter({ hasText: "Playgrounds didn't load" });
    await expect(alert).toBeVisible();
    fail = false;
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-playground-grid]')).toBeVisible();
  });

  test('Explore row, Show on map, and no unbacked claims', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlaygrounds(page);
    await page.goto('/playgrounds');
    await expect(page.locator('[data-playground-grid]')).toBeVisible();

    await expect(page.locator('[data-show-on-map]')).toHaveAttribute('href', '/map?layers=playground');
    const row = page.locator('[data-explore-section-links]');
    await expect(row.getByRole('link', { name: 'Playgrounds' })).toHaveAttribute('aria-current', 'page');

    const text = await pageBodyText(page);
    expect(text).not.toMatch(/\bFree\b/);
    expect(text).not.toMatch(/by families/i);
    expect(text).not.toMatch(/editors/i);
    expect(text).not.toMatch(/All ages welcome/i);

    // n is the metro count from the facets query: four fixture rows.
    await expect(page.locator('meta[name="description"]').last()).toHaveAttribute(
      'content',
      '4 playgrounds across the Des Moines metro, with shade, restrooms, surface and accessibility notes where we have them.',
    );
  });
});

/** The page's own text, without the site header and footer (whose newsletter copy is not a claim about playgrounds). */
async function pageBodyText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = (document.querySelector('main') ?? document.body).cloneNode(true) as HTMLElement;
    root.querySelectorAll('header, footer, script, style').forEach((el) => el.remove());
    return root.innerText;
  });
}
