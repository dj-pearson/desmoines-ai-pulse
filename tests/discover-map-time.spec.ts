import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * explore-pass2 WP2 items 1-3 and 5: the Discover map's time chips at a known
 * instant.
 *
 * page.clock.setSystemTime, never page.clock.install: setSystemTime moves the
 * wall clock and leaves timers running in real time, so Leaflet's pan and fly
 * animations still finish and moveend still fires (discover-map.spec.ts
 * explains what a frozen clock does to the map).
 *
 * The fixture backend does not filter. Rows that should not show are handed to
 * the page anyway, and the page must drop them; what the request asks the
 * server for is asserted from its URL.
 */

test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Chicago' });

// Inside the map's default Des Moines viewport (centre 41.5868, -93.625, z13).
const LAT = 41.5868;
const LNG = -93.625;

// Fri 2026-10-02 in CDT (UTC-5).
const FRI_1910 = new Date('2026-10-03T00:10:00Z');
const FRI_2100 = new Date('2026-10-03T02:00:00Z');
// Mon 2026-09-28 10:00 CDT.
const MON_1000 = new Date('2026-09-28T15:00:00Z');
const FRI_MIDNIGHT_CT = '2026-10-02T05:00:00.000Z';

function eventRow(i: number, title: string, extra: Record<string, unknown>) {
  return {
    id: `b1000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    latitude: LAT + i * 0.001,
    longitude: LNG + i * 0.001,
    enhanced_description: 'A fixture event for the map time chips.',
    original_description: null,
    category: 'Music',
    end_date: null,
    event_start_local: null,
    is_merged: false,
    is_hidden: false,
    archived_at: null,
    ...extra,
  };
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function everyDay(open: string, close: string) {
  return Object.fromEntries(WEEK.map((d) => [d, { open, close }]));
}

function attractionRow(i: number, name: string, extra: Record<string, unknown>) {
  return {
    id: `b3000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name,
    latitude: LAT - i * 0.001,
    longitude: LNG + i * 0.001,
    description: 'A fixture attraction.',
    type: 'Museum',
    hours: null,
    hours_summary: null,
    is_active: true,
    ...extra,
  };
}

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

async function setup(page: Page, at: Date, tables: Record<string, unknown[]>): Promise<string[]> {
  const requested: string[] = [];
  await page.clock.setSystemTime(at);
  await installFixtureBackend(page);
  await page.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  for (const table of ['events', 'restaurants', 'attractions', 'playgrounds', 'trails']) {
    await page.route(`**/rest/v1/${table}?**`, (route) => {
      requested.push(route.request().url());
      return json(route, tables[table] ?? []);
    });
  }
  return requested;
}

function marker(page: Page, name: string) {
  return page.locator(`.leaflet-marker-icon[title^="${name},"]`);
}

test.describe('/map time chips', () => {
  test('Tonight at 7:10 PM keeps the 7 PM show and never prints 7:31', async ({ page }) => {
    await setup(page, FRI_1910, {
      events: [
        eventRow(1, 'Seven Oclock Show', {
          date: '2026-10-03T00:00:00Z',
          event_start_utc: '2026-10-03T00:00:00Z',
          event_start_local: '2026-10-02T19:00:00',
        }),
        // The ingest marker for "no start time": 19:31:58 Central.
        eventRow(2, 'Untimed Fair Day', {
          date: '2026-10-03T00:31:58Z',
          event_start_utc: '2026-10-03T00:31:58Z',
          event_start_local: '2026-10-02T19:31:58',
        }),
      ],
    });
    await page.goto('/map?when=tonight&layers=event');

    await expect(marker(page, 'Seven Oclock Show')).toHaveCount(1);
    await expect(marker(page, 'Seven Oclock Show')).toHaveAttribute('title', /Started 7 PM$/);
    await expect(marker(page, 'Untimed Fair Day')).toHaveAttribute('title', /Today$/);

    const titles = await page.locator('.leaflet-marker-icon[title]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('title') ?? ''),
    );
    expect(titles.join(' | ')).not.toContain('7:31');
    const list = page.getByRole('list', { name: 'Results in view' }).first();
    await expect(list).toContainText('Started 7 PM');
    await expect(list).not.toContainText('7:31');
  });

  test('on a Monday, This weekend asks from Friday and shows the weekend', async ({ page }) => {
    const requested = await setup(page, MON_1000, {
      events: [
        eventRow(3, 'Saturday Market', {
          date: '2026-10-03T14:00:00Z',
          event_start_utc: '2026-10-03T14:00:00Z',
          event_start_local: '2026-10-03T09:00:00',
        }),
      ],
    });
    await page.goto('/map?when=weekend&layers=event');

    await expect(marker(page, 'Saturday Market')).toHaveCount(1);
    await expect(marker(page, 'Saturday Market')).toHaveAttribute('title', /Sat, Oct 3, 9 AM$/);

    const events = requested.map(decodeURIComponent).filter((u) => u.includes('/rest/v1/events?'));
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last).toContain(`date.gte.${FRI_MIDNIGHT_CT}`);
    expect(last).toContain(`end_date.gte.${FRI_MIDNIGHT_CT}`);
    expect(last).toMatch(/date=lte\./);
  });

  test('Now at 9 PM plots attractions that are open, and says what it held back', async ({ page }) => {
    const requested = await setup(page, FRI_2100, {
      attractions: [
        attractionRow(1, 'Early Museum', { hours: everyDay('09:00', '17:00') }),
        attractionRow(2, 'Late Gallery', { hours: everyDay('10:00', '23:00') }),
        attractionRow(3, 'No Hours Hall', {}),
      ],
      playgrounds: [
        {
          id: 'b4000000-0000-0000-0000-000000000001',
          name: 'Evening Playground',
          latitude: LAT + 0.002,
          longitude: LNG - 0.002,
          description: 'A fixture playground.',
          age_range: '2-12',
        },
      ],
    });
    await page.goto('/map?when=now&layers=attraction,playground');

    await expect(marker(page, 'Late Gallery')).toHaveCount(1);
    await expect(marker(page, 'Late Gallery')).toHaveAttribute('title', /Open until 11 PM$/);
    await expect(marker(page, 'Evening Playground')).toHaveCount(1);
    await expect(marker(page, 'Early Museum')).toHaveCount(0);
    await expect(marker(page, 'No Hours Hall')).toHaveCount(0);

    const list = page.getByRole('list', { name: 'Results in view' }).first();
    await expect(list).toContainText('1 place without listed hours is hidden.');
    await expect(list).toContainText('Parks and trails show at any time.');

    const attractions = requested.map(decodeURIComponent).find((u) => u.includes('/rest/v1/attractions?'));
    expect(attractions).toContain('is_active=eq.true');
    expect(attractions).toContain('hours');

    // Under Any time the museum is back, with its status.
    await page.getByRole('button', { name: 'Any time' }).click();
    await expect(marker(page, 'Early Museum')).toHaveAttribute('title', /Closed/);
    await expect(marker(page, 'No Hours Hall')).toHaveCount(1);
  });
});
