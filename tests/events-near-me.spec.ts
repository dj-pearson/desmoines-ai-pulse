import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan WP6: /events/near-me and the suburb pages.
 *
 * installFixtureBackend answers every RPC with [] and every events read with
 * its 12 rows, so this spec registers its own handlers AFTER it (the last
 * registered handler wins):
 *
 * - rpc/search_events_near_location returns rows in the RPC's own return
 *   shape (20251110000000_add_geospatial_proximity_search.sql), one of which
 *   is hidden;
 * - the events table answers the visibility check (filterVisibleIds, an
 *   `id=in.(...)` read) with every id except the hidden one, which is what
 *   the is_hidden predicate would do in production.
 *
 * The fake does not filter anything else on purpose; which rows a query
 * matches is covered by src/lib/__tests__/nearMeOrigins.test.tsx.
 */

const HIDDEN_ID = '50000000-0000-0000-0000-000000000099';
const UUID_PATH = /\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function rpcRow(i: number, id = `50000000-0000-0000-0000-${String(i).padStart(12, '0')}`) {
  return {
    id,
    title: id === HIDDEN_ID ? 'Hidden Near Me Fixture' : `Near Me Fixture ${i}`,
    date: '2099-06-0' + ((i % 9) + 1) + 'T00:00:00Z',
    location: 'Des Moines',
    venue: `Venue ${i}`,
    city: 'Des Moines',
    category: 'Music',
    price: '$15',
    image_url: null,
    latitude: 41.58 + i * 0.001,
    longitude: -93.62,
    enhanced_description: 'Supplied by events-near-me.spec.ts',
    is_featured: false,
    event_start_utc: '2099-06-0' + ((i % 9) + 1) + 'T00:30:00Z',
    event_start_local: null,
    distance_meters: 400 * (i + 1),
  };
}

const RPC_ROWS = [...Array.from({ length: 5 }, (_, i) => rpcRow(i)), rpcRow(5, HIDDEN_ID)];

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

/** Installs the near-me fixtures and returns the RPC request log. */
async function installNearMe(page: Page): Promise<string[]> {
  await installFixtureBackend(page);
  const rpcCalls: string[] = [];

  await page.route('**/rest/v1/events?*', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('id=in.(')) {
      return json(
        route,
        RPC_ROWS.filter((r) => r.id !== HIDDEN_ID).map((r) => ({ id: r.id })),
      );
    }
    return route.fallback();
  });

  await page.route('**/rest/v1/rpc/search_events_near_location*', (route) => {
    rpcCalls.push(route.request().postData() ?? '');
    return json(route, RPC_ROWS);
  });

  return rpcCalls;
}

test.describe('/events/near-me', () => {
  test('list cards link by slug and hidden rows never render', async ({ page }) => {
    await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');

    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();
    await expect(page.getByText('Hidden Near Me Fixture')).toHaveCount(0);

    const hrefs = await page
      .locator('a[href^="/events/near-me-fixture"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs.length).toBe(5);
    for (const href of hrefs) expect(href).not.toMatch(UUID_PATH);
  });

  test('map popup href equals the list card href', async ({ page }) => {
    await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');
    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();

    const listHrefs = await page
      .locator('a[href^="/events/near-me-fixture"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(listHrefs.length).toBe(5);

    await page.getByRole('button', { name: 'Map' }).click();
    const marker = page.locator('.leaflet-marker-icon').first();
    await expect(marker).toBeVisible();
    await marker.click();
    // evaluateAll does not wait, so wait for the popup to open first.
    const popupLinks = page.locator('.leaflet-popup a[href^="/events/"]');
    await expect(popupLinks.first()).toBeAttached();
    const popupHrefs = await popupLinks
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(popupHrefs.length).toBeGreaterThan(0);
    for (const href of popupHrefs) {
      expect(href).not.toMatch(UUID_PATH);
      expect(listHrefs).toContain(href);
    }
  });

  test('dragging the radius end to end sends at most 2 RPCs', async ({ page }) => {
    const calls = await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');
    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();
    const before = calls.length;

    const thumb = page.getByRole('slider', { name: 'Search radius' });
    const track = thumb.locator('xpath=ancestor::span[contains(@class, "touch-none")][1]');
    await thumb.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) throw new Error('slider not laid out');
    const y = box.y + box.height / 2;

    // Press at the 1-mile end, drag to the 50-mile end, release: one gesture.
    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, y, { steps: 15 });
    await page.mouse.move(box.x + box.width - 2, y, { steps: 15 });
    await page.mouse.up();

    await expect(thumb).toHaveAttribute('aria-valuetext', '50 miles');
    await page.waitForTimeout(500);
    expect(calls.length - before).toBeLessThanOrEqual(2);
  });

  test('a visitor who denies location can measure from Ankeny', async ({ page }) => {
    // Headless Chromium leaves an ungranted prompt pending rather than denying
    // it, so stand in for the browser's answer: PERMISSION_DENIED.
    await page.addInitScript(() => {
      const geolocation = {
        getCurrentPosition: (
          _ok: PositionCallback,
          fail?: PositionErrorCallback | null,
        ) => {
          fail?.({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        },
        watchPosition: () => 0,
        clearWatch: () => undefined,
      };
      Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
    });
    await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');

    await page.getByRole('button', { name: 'Use my current location' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel('Measure distance from').click();
    await page.getByRole('option', { name: 'Ankeny' }).click();
    await expect(page.getByText(/mi from Ankeny/).first()).toBeVisible();
  });
});

test.describe('/events/<suburb>', () => {
  test('/events/ankeny asks the server for Ankeny rows and visible rows only', async ({ page }) => {
    await installFixtureBackend(page);
    const listQueries: string[] = [];
    await page.route('**/rest/v1/events?*', (route) => {
      listQueries.push(decodeURIComponent(route.request().url()));
      return route.fallback();
    });

    await page.goto('/events/ankeny');
    await expect(page.getByRole('heading', { level: 1, name: 'Events in Ankeny' })).toBeVisible();
    await expect.poll(() => listQueries.length).toBeGreaterThan(0);

    const query = listQueries.find((q) => q.includes('city.ilike'));
    expect(query, 'the suburb query filters on city/location/venue').toBeTruthy();
    expect(query).toContain('city.ilike.%Ankeny%');
    expect(query).toContain('is_hidden=neq.true');
    expect(query).toContain('is_merged=neq.true');
    expect(query).toContain('archived_at=is.null');
  });
});
