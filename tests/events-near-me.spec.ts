import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * /events/near-me and the suburb pages (events plan WP6, events-pass2 WP5).
 *
 * installFixtureBackend answers every RPC with [] and every events read with
 * its 12 rows, so this spec registers its own handlers AFTER it (the last
 * registered handler wins):
 *
 * - rpc/search_events_near_location returns ids and distances in the RPC's
 *   own return shape (20251110000000_add_geospatial_proximity_search.sql),
 *   one of which is hidden;
 * - the events read by id (`id=in.(...)`, the Anytime path) answers every
 *   row except the hidden one, which is what the is_hidden predicate would
 *   do in production;
 * - the windowed read (a `latitude=gte.` box) answers WINDOW_ROWS.
 *
 * The fake does not filter anything else on purpose; which rows a query
 * matches is covered by src/lib/__tests__/nearMeOrigins.test.tsx and
 * eventAreas.test.ts. What this spec pins is the SHAPE of each request and
 * what the page does with the answer.
 */

const HIDDEN_ID = '50000000-0000-0000-0000-000000000099';
const UUID_PATH = /\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * A card's title link. Not the event-card-link test id: vite.config.ts strips
 * data-testid from every build, dev server included.
 */
const CARD_LINK = 'h3 > a[href^="/events/"], h4 > a[href^="/events/"]';

/** A request URL as text: supabase-js writes spaces as `+`. */
function readUrl(route: Route): string {
  return decodeURIComponent(route.request().url().replace(/\+/g, '%20'));
}

function eventRow(
  i: number,
  id = `50000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  prefix = 'Near Me Fixture',
) {
  return {
    id,
    title: id === HIDDEN_ID ? 'Hidden Near Me Fixture' : `${prefix} ${i}`,
    date: '2099-06-0' + ((i % 9) + 1) + 'T00:30:00Z',
    end_date: null,
    location: 'Des Moines',
    venue: `Venue ${i}`,
    city: 'Des Moines',
    category: 'Music',
    price: '$15',
    image_url: null,
    source_url: null,
    // Stepping north from Downtown (41.587, -93.625), about 0.07 mi apart.
    latitude: 41.587 + i * 0.001,
    longitude: -93.625,
    enhanced_description: 'Supplied by events-near-me.spec.ts',
    original_description: null,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    event_start_utc: '2099-06-0' + ((i % 9) + 1) + 'T00:30:00Z',
    event_start_local: null,
    event_timezone: 'America/Chicago',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const ROWS = [...Array.from({ length: 5 }, (_, i) => eventRow(i)), eventRow(5, HIDDEN_ID)];
const RPC_ROWS = ROWS.map((r, i) => ({ ...r, distance_meters: 400 * (i + 1) }));

/** Windowed answers, placed around Ankeny (41.73, -93.6). */
const WINDOW_ROWS = Array.from({ length: 5 }, (_, i) => ({
  ...eventRow(i, `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`, 'Window Fixture'),
  latitude: 41.73 + i * 0.002,
  longitude: -93.6,
}));

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

interface NearMeLog {
  rpc: string[];
  windowed: string[];
}

/** Installs the near-me fixtures and returns the request log. */
async function installNearMe(page: Page, rpcRows: unknown[] = RPC_ROWS): Promise<NearMeLog> {
  await installFixtureBackend(page);
  const log: NearMeLog = { rpc: [], windowed: [] };

  await page.route('**/rest/v1/events?*', (route) => {
    const url = readUrl(route);
    if (url.includes('id=in.(')) {
      return json(route, ROWS.filter((r) => r.id !== HIDDEN_ID));
    }
    if (url.includes('latitude=gte.')) {
      log.windowed.push(url);
      return json(route, WINDOW_ROWS);
    }
    return route.fallback();
  });

  await page.route('**/rest/v1/rpc/search_events_near_location*', (route) => {
    log.rpc.push(route.request().postData() ?? '');
    return json(route, rpcRows);
  });

  return log;
}

test.describe('/events/near-me', () => {
  test('list cards link by slug and hidden rows never render', async ({ page }) => {
    await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');

    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();
    await expect(page.getByText('Hidden Near Me Fixture')).toHaveCount(0);

    const hrefs = await page
      .locator(CARD_LINK)
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs.length).toBe(5);
    for (const href of hrefs) expect(href).not.toMatch(UUID_PATH);
  });

  test('a window reads the table, not the RPC, and keeps every row in it', async ({ page }) => {
    // 300 rows nearer than any in the window, on later dates: the RPC's LIMIT
    // used to fill with these. The windowed read never asks for them.
    const nearer = Array.from({ length: 300 }, (_, i) => ({
      ...eventRow(i, `70000000-0000-0000-0000-${String(i).padStart(12, '0')}`, 'Later'),
      distance_meters: i,
    }));
    const log = await installNearMe(page, nearer);
    await page.goto('/events/near-me?from=ankeny&when=next-7-days');

    for (const row of WINDOW_ROWS) await expect(page.getByText(row.title)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('5 events within 25 miles of Ankeny');
    expect(log.rpc).toHaveLength(0);

    const url = log.windowed[0];
    expect(url, 'the windowed read').toBeTruthy();
    for (const part of [
      'is_hidden=neq.true',
      'is_merged=neq.true',
      'archived_at=is.null',
      'latitude=not.is.null',
      'latitude=lte.',
      'longitude=gte.',
      'longitude=lte.',
      'date=lte.',
      'limit=1000',
    ]) {
      expect(url).toContain(part);
    }
  });

  test("the hub's hand-off lands on the same window and category", async ({ page }) => {
    const log = await installNearMe(page);
    await page.goto('/events/near-me?when=today&category=Music');
    await expect(page.getByRole('button', { name: 'Today', pressed: true })).toBeVisible();
    await expect.poll(() => log.windowed.length).toBeGreaterThan(0);
    expect(log.windowed[0]).toContain('category=eq.Music');
  });

  test('the map is the events map: origin marker, distance in the popup, same hrefs', async ({ page }) => {
    await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');
    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();

    const listHrefs = await page
      .locator(CARD_LINK)
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(listHrefs.length).toBe(5);

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Map of matching events' })).toBeVisible();
    // The origin is named, not "You", when it is a picked place.
    await expect(page.locator('.leaflet-marker-icon[title="Downtown"]')).toHaveCount(1);

    const marker = page.locator('.leaflet-marker-icon[aria-label*="Near Me Fixture"]').first();
    await expect(marker).toBeVisible();
    await marker.click();
    const popup = page.locator('.leaflet-popup');
    await expect(popup).toContainText(/mi from Downtown/);
    const popupLinks = popup.locator('a[href^="/events/"]');
    await expect(popupLinks.first()).toBeAttached();
    const popupHrefs = await popupLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(popupHrefs.length).toBeGreaterThan(0);
    for (const href of popupHrefs) {
      expect(href).not.toMatch(UUID_PATH);
      expect(listHrefs).toContain(href);
    }
    // No coordinate readout anywhere on the page.
    await expect(page.getByText(/-93\.\d{2}/)).toHaveCount(0);
  });

  test('dragging the radius end to end sends at most 2 RPCs', async ({ page }) => {
    const log = await installNearMe(page);
    await page.goto('/events/near-me?when=anytime');
    await expect(page.getByText('Near Me Fixture 0')).toBeVisible();

    await page.getByRole('button', { name: /Radius and category/ }).click();
    const thumb = page.getByRole('slider', { name: 'Search radius' });
    await expect(thumb).toBeVisible();
    // The sheet slides up; measure the track after it has settled.
    await page.waitForTimeout(600);
    const before = log.rpc.length;
    const track = thumb.locator('xpath=ancestor::span[contains(@class, "touch-none")][1]');
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
    await expect(page).toHaveURL(/[?&]r=50/);
    await page.waitForTimeout(500);
    expect(log.rpc.length - before).toBeLessThanOrEqual(2);
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
    await expect(page).toHaveURL(/[?&]from=ankeny/);
    await expect(page.getByRole('status')).toContainText('of Ankeny');
  });
});

test.describe('/events/<suburb>', () => {
  test('/events/ankeny asks for Ankeny by place, visible rows only', async ({ page }) => {
    await installFixtureBackend(page);
    const listQueries: string[] = [];
    await page.route('**/rest/v1/events?*', (route) => {
      listQueries.push(readUrl(route));
      return route.fallback();
    });

    await page.goto('/events/ankeny');
    await expect(page.getByRole('heading', { level: 1, name: 'Events in Ankeny' })).toBeVisible();
    await expect.poll(() => listQueries.length).toBeGreaterThan(0);

    const query = listQueries.find((q) => q.includes('city.ilike.Ankeny'));
    expect(query, 'the suburb query matches on city').toBeTruthy();
    expect(query).toContain('location.ilike."%, Ankeny"');
    // Place, not substring: no wildcard on either side of the city.
    expect(query).not.toContain('%Ankeny%');
    expect(query).toContain('is_hidden=neq.true');
    expect(query).toContain('is_merged=neq.true');
    expect(query).toContain('archived_at=is.null');

    await expect(page.getByRole('link', { name: 'Events by distance from Ankeny' })).toHaveAttribute(
      'href',
      '/events/near-me?from=ankeny',
    );
  });

  test('the stat block prints no number until the events read succeeds', async ({ page }) => {
    await installFixtureBackend(page);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/rest/v1/events?*', async (route) => {
      await held;
      return route.fallback();
    });

    await page.goto('/events/ankeny');
    const stats = page.locator('dl[aria-busy]');
    await expect(stats).toHaveAttribute('aria-busy', 'true');
    const pending = await stats.locator('dd').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).innerText.trim()),
    );
    expect(pending.every((text) => text === ''), `values while pending: ${pending.join('|')}`).toBe(true);

    release();
    await expect(stats).toHaveAttribute('aria-busy', 'false');
    await expect(stats.locator('dd').first()).toHaveText(/^\d+\+?$/);
  });

  test('?location=waukee on the hub and /events/waukee send the same place filter', async ({ page }) => {
    await installFixtureBackend(page);
    const seen: string[] = [];
    await page.route('**/rest/v1/events?*', (route) => {
      seen.push(readUrl(route));
      return route.fallback();
    });
    const group = 'city.ilike.Waukee,and(city.is.null,or(location.ilike."%, Waukee"';

    await page.goto('/events/waukee');
    await expect(page.getByRole('heading', { level: 1, name: 'Events in Waukee' })).toBeVisible();
    await expect.poll(() => seen.some((u) => u.includes(group))).toBe(true);
    const suburbHrefs = await page
      .locator(CARD_LINK)
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));

    seen.length = 0;
    await page.goto('/events?location=waukee');
    await expect.poll(() => seen.some((u) => u.includes(group))).toBe(true);
    await expect(page.locator(CARD_LINK).first()).toBeVisible();
    const hubHrefs = await page
      .locator(CARD_LINK)
      .evaluateAll((els) => els.map((el) => el.getAttribute('href')));

    // Same fixture answer, same rows on both pages.
    expect(suburbHrefs.length).toBeGreaterThan(0);
    for (const href of suburbHrefs) expect(hubHrefs).toContain(href);
  });
});
