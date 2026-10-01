import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP2: /map (the Discover map).
 *
 * Each table the map reads is answered here with page.route, registered after
 * installFixtureBackend so it wins. The fixture backend does not filter, on
 * purpose: the hidden event and the closed restaurant below reach the page, and
 * the page must still plot neither. Whether the REQUEST carries the predicates
 * is asserted separately, from the URL.
 *
 * No page.clock here. Leaflet times its pan and fly animations off Date, so a
 * frozen clock leaves every animation unfinished and moveend never fires. The
 * event rows are dated years ahead and every test pins ?when=any instead.
 */

test.use({ viewport: { width: 1280, height: 800 } });

const ISO = '2026-01-01T00:00:00Z';
// Inside the map's default Des Moines viewport (centre 41.5868, -93.625, z13).
const LAT = 41.5868;
const LNG = -93.625;

function eventRow(i: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    id: `a1000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    latitude: LAT + i * 0.001,
    longitude: LNG + i * 0.001,
    enhanced_description: 'A fixture event for the Discover map.',
    original_description: null,
    category: 'Music',
    date: '2030-10-04T00:30:00Z',
    end_date: null,
    event_start_utc: '2030-10-04T00:30:00Z',
    is_merged: false,
    is_hidden: false,
    archived_at: null,
    ...extra,
  };
}

function restaurantRow(i: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `a2000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    slug: `map-fixture-${i}`,
    name,
    latitude: LAT - i * 0.001,
    longitude: LNG - i * 0.001,
    description: 'A fixture restaurant for the Discover map.',
    cuisine: 'American',
    rating: 4.1,
    opening: 'Daily 11am-10pm',
    status: 'active',
    is_merged: false,
    created_at: ISO,
    ...extra,
  };
}

const EVENTS = [
  eventRow(1, 'Visible Show'),
  eventRow(2, 'Hidden Show', { is_hidden: true }),
];
const RESTAURANTS = [
  restaurantRow(1, 'Open Kitchen'),
  restaurantRow(2, 'Gone Diner', { status: 'closed' }),
];
const ATTRACTIONS = [
  {
    id: 'a3000000-0000-0000-0000-000000000001',
    name: 'Fixture Art Center',
    latitude: LAT + 0.002,
    longitude: LNG - 0.002,
    description: 'A fixture attraction.',
    type: 'Museum',
    hours: null,
    hours_summary: null,
    is_active: true,
  },
  // Retired. The server is asked to drop it; the page must drop it anyway.
  {
    id: 'a3000000-0000-0000-0000-000000000002',
    name: 'Closed For Good Museum',
    latitude: LAT + 0.0025,
    longitude: LNG - 0.0025,
    description: 'A retired fixture attraction.',
    type: 'Museum',
    hours: null,
    hours_summary: null,
    is_active: false,
  },
];
const PLAYGROUNDS = [
  {
    id: 'a4000000-0000-0000-0000-000000000001',
    name: 'Fixture Park Playground',
    latitude: LAT - 0.002,
    longitude: LNG + 0.002,
    description: 'A fixture playground.',
    age_range: '2-12',
  },
];
const TRAILS = [
  {
    id: 'a5000000-0000-0000-0000-000000000001',
    name: 'Fixture River Trail',
    slug: 'fixture-river-trail',
    latitude: LAT + 0.003,
    longitude: LNG + 0.003,
    description: 'A fixture trail.',
    length_miles: 4.2,
    difficulty: 'Easy',
  },
];

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

const TABLE_ROWS: Record<string, unknown[]> = {
  events: EVENTS,
  restaurants: RESTAURANTS,
  attractions: ATTRACTIONS,
  playgrounds: PLAYGROUNDS,
  trails: TRAILS,
};

/** `fail: true` fails every layer; a list of tables fails just those. */
async function setup(page: Page, options: { fail?: boolean | string[] } = {}): Promise<string[]> {
  const requested: string[] = [];
  await installFixtureBackend(page);
  // Tiles are not what this spec is about, and CI has no route to OSM.
  await page.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  for (const [table, rows] of Object.entries(TABLE_ROWS)) {
    await page.route(`**/rest/v1/${table}?**`, (route) => {
      requested.push(route.request().url());
      const fails = Array.isArray(options.fail) ? options.fail.includes(table) : options.fail;
      if (fails) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ code: 'XX000', message: 'fixture outage' }),
        });
      }
      return json(route, rows);
    });
  }
  return requested;
}

function marker(page: Page, name: string) {
  return page.locator(`.leaflet-marker-icon[title^="${name},"]`);
}

test.describe('/map', () => {
  test('loads Leaflet CSS and never asks for the default marker image', async ({ page }) => {
    const markerImages: string[] = [];
    page.on('request', (req) => {
      if (/marker-icon(-2x)?\.png|marker-shadow\.png/.test(req.url())) markerImages.push(req.url());
    });
    await setup(page);
    await page.goto('/map?when=any');

    await expect(marker(page, 'Visible Show')).toHaveCount(1);
    // leaflet.css positions every pane absolutely; without the stylesheet the
    // panes are static and the tiles stack into a scattered column.
    const panePosition = await page
      .locator('.leaflet-map-pane')
      .evaluate((el) => getComputedStyle(el).position);
    expect(panePosition).toBe('absolute');
    const zoomDisplay = await page
      .locator('.leaflet-control-zoom a')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(zoomDisplay).toBe('block');
    expect(markerImages).toEqual([]);
  });

  test('plots no hidden event and no closed restaurant, and asks the server not to', async ({ page }) => {
    const requested = await setup(page);
    await page.goto('/map?when=any');

    await expect(marker(page, 'Visible Show')).toHaveCount(1);
    await expect(marker(page, 'Open Kitchen')).toHaveCount(1);
    await expect(marker(page, 'Hidden Show')).toHaveCount(0);
    await expect(marker(page, 'Gone Diner')).toHaveCount(0);

    const events = requested.find((u) => u.includes('/rest/v1/events?'));
    const restaurants = requested.find((u) => u.includes('/rest/v1/restaurants?'));
    expect(events).toBeTruthy();
    expect(restaurants).toBeTruthy();
    expect(decodeURIComponent(events!)).toContain('is_hidden=neq.true');
    expect(decodeURIComponent(events!)).toContain('is_merged=neq.true');
    expect(decodeURIComponent(events!)).toContain('archived_at=is.null');
    // Bounds reach the server on the very first request.
    expect(decodeURIComponent(events!)).toMatch(/latitude=gte\./);
    expect(decodeURIComponent(restaurants!)).toContain('is_merged=not.is.true');
    expect(decodeURIComponent(restaurants!)).toContain('status.not.in.(closed,opening_soon,announced)');
  });

  test('plots no retired attraction, and asks the server for active ones only', async ({ page }) => {
    const requested = await setup(page);
    await page.goto('/map?when=any');

    await expect(marker(page, 'Fixture Art Center')).toHaveCount(1);
    await expect(marker(page, 'Closed For Good Museum')).toHaveCount(0);
    const attractions = requested.find((u) => u.includes('/rest/v1/attractions?'));
    expect(decodeURIComponent(attractions!)).toContain('is_active=eq.true');
  });

  test('a marker click selects it, and closing the popup clears ?sel=', async ({ page }) => {
    await setup(page);
    await page.goto('/map?when=any');
    await expect(marker(page, 'Visible Show')).toHaveCount(1);

    await marker(page, 'Visible Show').click();
    await expect(page).toHaveURL(/[?&]sel=a1000000-0000-0000-0000-000000000001/);
    const popup = page.locator('.leaflet-popup');
    await expect(popup).toContainText('Visible Show');

    await page.locator('.leaflet-popup-close-button').click();
    await expect(popup).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]sel=/);
  });

  test('a cold ?sel= outside the first viewport flies there and opens its popup', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('https://*.tile.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 204, body: '' }),
    );
    // About 20 km north of the default centre, well outside the z13 view.
    const far = eventRow(9, 'Far North Fair', { latitude: 41.78, longitude: -93.62 });
    await page.route('**/rest/v1/events?**', (route) => json(route, [EVENTS[0], far]));
    for (const table of ['restaurants', 'attractions', 'playgrounds', 'trails']) {
      await page.route(`**/rest/v1/${table}?**`, (route) => json(route, []));
    }
    await page.goto(`/map?when=any&layers=event&sel=${far.id}`);

    await expect(marker(page, 'Far North Fair')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.leaflet-popup')).toContainText('Far North Fair');
    await expect(page).toHaveURL(new RegExp(`[?&]sel=${far.id}`));
  });

  test('counts what is in view and links each result to its canonical page', async ({ page }) => {
    await setup(page);
    await page.goto('/map?when=any');

    const list = page.getByRole('list', { name: 'Results in view' }).first();
    await expect(list.getByRole('button', { name: /Visible Show/ })).toBeVisible();
    // Visible Show, Open Kitchen, Fixture Art Center: three pins, three rows.
    await expect(page.getByText('3 in view').first()).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title]')).toHaveCount(3);

    await expect(list.getByRole('link', { name: 'View details for Visible Show' })).toHaveAttribute(
      'href',
      '/events/visible-show-2030-10-03',
    );
    await expect(list.getByRole('link', { name: 'View details for Open Kitchen' })).toHaveAttribute(
      'href',
      '/restaurants/map-fixture-1',
    );
    await expect(
      list.getByRole('link', { name: 'View details for Fixture Art Center' }),
    ).toHaveAttribute('href', '/attractions/fixture-art-center');

    // No link inside a button (axe nested-interactive).
    await expect(page.locator('button a, button button')).toHaveCount(0);
  });

  test('Search this area keeps the map mounted and in place', async ({ page }) => {
    await setup(page);
    await page.goto('/map?when=any');
    await expect(marker(page, 'Visible Show')).toHaveCount(1);

    const search = page.getByRole('button', { name: 'Search this area' });
    await expect(search).toBeDisabled();

    const container = page.locator('.leaflet-container');
    await container.evaluate((el) => {
      (el as HTMLElement).dataset.probe = 'mounted-once';
    });
    await container.focus();
    await page.keyboard.press('ArrowRight');
    await expect(search).toBeEnabled();

    const pane = page.locator('.leaflet-map-pane');
    const before = await pane.evaluate((el) => (el as HTMLElement).style.transform);
    await search.click();

    await expect(search).toBeDisabled();
    // URLSearchParams writes the commas as %2C; either spelling is the same value.
    await expect(page).toHaveURL(/[?&]bbox=-?\d+\.\d{4}(,|%2C)-?\d+\.\d{4}(,|%2C)/);
    await expect(container).toHaveAttribute('data-probe', 'mounted-once');
    expect(await pane.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
  });

  test('opens pre-filtered from the URL', async ({ page }) => {
    await setup(page);
    await page.goto('/map?layers=playground&when=now');

    // Scoped to the chip group: the site nav also has an "Events" button.
    const layers = page.getByRole('group', { name: 'Map layers' });
    await expect(layers.getByRole('button', { name: /Playgrounds/, pressed: true })).toBeVisible();
    await expect(layers.getByRole('button', { name: /Events/, pressed: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Now', pressed: true })).toBeVisible();
    await expect(marker(page, 'Fixture Park Playground')).toHaveCount(1);
    await expect(marker(page, 'Visible Show')).toHaveCount(0);

    const list = page.getByRole('list', { name: 'Results in view' }).first();
    await expect(
      list.getByRole('link', { name: 'View details for Fixture Park Playground' }),
    ).toHaveAttribute('href', '/playgrounds/fixture-park-playground');
  });

  test('one failed layer names itself and the others still render', async ({ page }) => {
    await setup(page, { fail: ['trails'] });
    await page.goto('/map?when=any&layers=event,restaurant,trail');

    await expect(marker(page, 'Visible Show')).toHaveCount(1);
    await expect(marker(page, 'Open Kitchen')).toHaveCount(1);
    const alert = page.getByRole('alert').filter({ hasText: 'Could not load Trails' });
    await expect(alert.first()).toBeVisible({ timeout: 20_000 });
  });

  test('says the map could not load, with a retry, when every layer fails', async ({ page }) => {
    await setup(page, { fail: true });
    await page.goto('/map?when=any');

    const alert = page.getByRole('alert').filter({ hasText: 'The map could not load places right now.' });
    await expect(alert.first()).toBeVisible({ timeout: 20_000 });
    await expect(alert.first().getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText(/No results in this area/)).toHaveCount(0);
  });
});

test.describe('/map on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the OSM attribution is on screen and not covered', async ({ page }) => {
    await setup(page);
    await page.goto('/map?when=any');
    await expect(marker(page, 'Visible Show')).toHaveCount(1);

    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toContainText('OpenStreetMap');
    const box = await attribution.boundingBox();
    expect(box).not.toBeNull();
    const hit = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.leaflet-control-attribution'),
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(hit).toBe(true);
  });

  test('the page is exactly one screen tall', async ({ page }) => {
    await setup(page);
    await page.goto('/map?when=any');
    await expect(marker(page, 'Visible Show')).toHaveCount(1);
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBe(innerHeight);
  });
});
