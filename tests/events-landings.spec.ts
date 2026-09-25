import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan pass 2, WP3: the date and month landings are right about now.
 *
 * - /events/today carries a festival that opened yesterday under "Happening
 *   now", puts SeatGeek's 03:30 placeholder under "Time not listed", and uses
 *   the home rail's evening (4 PM Central) for "Tonight".
 * - /events/september-2026, viewed on Sep 25, leads with Sep 25-30 cards,
 *   folds the earlier weeks away, and renders no EventCard (its "View
 *   Details" button is how to tell).
 * - /events/march-1998 is noindex with no rel=prev/next.
 *
 * The fixture doesn't filter (tests/support/fixtureBackend.ts): every events
 * read gets the same rows, including the full-row card read. What is asserted
 * is what the page does with the rows it gets.
 *
 * Note on the plan's clock: 2026-09-25 is a Friday, not a Thursday, and at
 * 20:00 a 16:30 row has already started. So "a 16:30 row is under Tonight" is
 * checked at 13:00 CDT, when it is still ahead.
 */

// Fri 2026-09-25, 20:00 CDT.
const FRI_8PM = new Date('2026-09-26T01:00:00Z');
// Fri 2026-09-25, 13:00 CDT.
const FRI_1PM = new Date('2026-09-25T18:00:00Z');

function event(
  n: number,
  title: string,
  utc: string,
  local: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: `63000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    date: utc,
    event_start_utc: utc,
    event_start_local: local,
    end_date: null,
    enhanced_description: null,
    original_description: 'Supplied by events-landings.spec.ts',
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58,
    longitude: -93.62,
    location: 'Des Moines',
    price: '$15',
    source_url: 'https://example.com/fixture',
    venue: `Landing Venue ${n}`,
    writeup_generated_at: null,
    ...extra,
  };
}

type Row = ReturnType<typeof event>;

// Thu 10 AM CDT to Sun 10 PM CDT.
const FESTIVAL = event(1, 'Landing Thursday Festival', '2026-09-24T15:00:00Z', '2026-09-24T10:00:00', {
  end_date: '2026-09-28T03:00:00Z',
});
// SeatGeek's no-time placeholder: 03:30 local.
const SEATGEEK = event(2, 'Landing SeatGeek Listing', '2026-09-25T08:30:00Z', '2026-09-25T03:30:00', {
  source_url: 'https://seatgeek.com/landing-fixture-tickets',
});
// 4:30 PM CDT.
const FOUR_THIRTY = event(3, 'Landing Four Thirty Show', '2026-09-25T21:30:00Z', '2026-09-25T16:30:00');
// 9 PM CDT.
const NINE_PM = event(4, 'Landing Nine PM Show', '2026-09-26T02:00:00Z', '2026-09-25T21:00:00');

const SEP_3 = event(10, 'Landing September Third', '2026-09-03T17:00:00Z', '2026-09-03T12:00:00');
const SEP_24 = event(11, 'Landing September Twenty Fourth', '2026-09-24T17:00:00Z', '2026-09-24T12:00:00');
const SEP_25 = event(12, 'Landing September Twenty Fifth', '2026-09-25T23:00:00Z', '2026-09-25T18:00:00');
const SEP_30 = event(13, 'Landing September Thirtieth', '2026-10-01T01:00:00Z', '2026-09-30T20:00:00');

const CARD_LINKS = 'h3 > a[href^="/events/"], h4 > a[href^="/events/"]';

function reply(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

/** Every events read answers `rows`; the selects are recorded. */
async function installEvents(page: Page, at: Date, rows: Row[]): Promise<string[]> {
  const selects: string[] = [];
  await page.clock.setFixedTime(at);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events?**', (route) => {
    const select = new URL(route.request().url()).searchParams.get('select');
    if (select) selects.push(select);
    return reply(route, rows);
  });
  return selects;
}

const group = (page: Page, id: string) => page.locator(`section[aria-labelledby="today-${id}"]`);

test.describe('/events/today', () => {
  test('at Fri 20:00 CDT: the festival is happening now, SeatGeek 03:30 is untimed', async ({ page }) => {
    await installEvents(page, FRI_8PM, [FESTIVAL, SEATGEEK, NINE_PM]);
    await page.goto('/events/today');

    await expect(group(page, 'happening-now').getByText(FESTIVAL.title).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(group(page, 'time-not-listed').getByText(SEATGEEK.title).first()).toBeVisible();
    await expect(group(page, 'tonight').getByText(NINE_PM.title).first()).toBeVisible();
    await expect(page.getByText('Friday, September 25, 2026')).toBeVisible();
  });

  test('at Fri 13:00 CDT: a 4:30 PM show is under Tonight', async ({ page }) => {
    await installEvents(page, FRI_1PM, [FOUR_THIRTY]);
    await page.goto('/events/today');

    await expect(group(page, 'tonight').getByText(FOUR_THIRTY.title).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(group(page, 'this-afternoon')).toHaveCount(0);
  });
});

test.describe('/events/september-2026 on Sep 25', () => {
  test('leads with Sep 25-30, folds the earlier weeks, renders no EventCard', async ({ page }) => {
    const selects = await installEvents(page, FRI_8PM, [SEP_3, SEP_24, SEP_25, SEP_30]);
    await page.goto('/events/september-2026');

    const cards = page.locator(CARD_LINKS);
    await expect(cards.first()).toHaveText(SEP_25.title, { timeout: 30_000 });
    await expect(cards).toHaveText([SEP_25.title, SEP_30.title]);
    await expect(page.getByText(SEP_3.title)).toHaveCount(0);

    const earlier = page.locator('details[data-month-earlier]');
    await expect(earlier.locator('summary')).toContainText('2 events');

    await expect(page.getByRole('button', { name: /view details/i })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);

    // The calendar links a day to that day on the hub.
    await expect(page.locator('li[data-month-day="2026-09-25"] a')).toHaveAttribute(
      'href',
      '/events?from=2026-09-25&to=2026-09-25',
    );

    // The window read is the light projection; only the card read asks for descriptions.
    const windowSelect = selects.find((s) => !s.includes('image_url'));
    expect(windowSelect, 'no light window select was sent').toBeDefined();
    expect(windowSelect).not.toContain('enhanced_description');
  });
});

test.describe('/events/march-1998', () => {
  test('is noindex with no rel=prev/next', async ({ page }) => {
    await installEvents(page, FRI_8PM, []);
    await page.goto('/events/march-1998');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('March 1998', { timeout: 30_000 });
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    await expect(page.locator('a[rel="prev"], a[rel="next"], link[rel="prev"], link[rel="next"]')).toHaveCount(0);
  });
});
