import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events pass 2, WP2 (docs/page-plans/events-pass2.md): a card never claims a
 * time, a price or a liveness the row can't back.
 *
 *   - an untimed row (the 19:31:58 marker) reads "Time not listed", not "All day";
 *   - SeatGeek's 03:30 placeholder is not a showtime;
 *   - "$25; kids under 5 free" gets no Free badge, and ?price=free asks the
 *     server to refuse a nonzero amount;
 *   - three all-time check-ins on next week's show are not LIVE.
 *
 * installFixtureBackend answers everything; this spec registers its own events
 * and event_live_stats routes AFTER it (the last registered handler wins). The
 * fixture doesn't filter, so the price-filter case asserts the request, and the
 * query-level rule is pinned in src/lib/__tests__/eventPrice.test.ts.
 */

/** A Central calendar day `days` from now, as yyyy-MM-dd. */
function centralDay(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
}

const NEXT_WEEK = centralDay(7);
/** An ISO instant on `day` (or the next day when hourUtc >= 24), in UTC. */
function utcFor(day: string, hourUtc: number, minute = 0, second = 0): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + (hourUtc >= 24 ? 1 : 0));
  const h = String(hourUtc % 24).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  const s = String(second).padStart(2, '0');
  return `${next.toISOString().slice(0, 10)}T${h}:${m}:${s}Z`;
}

const ID = {
  untimed: '50000000-0000-0000-0000-000000000001',
  seatgeek: '50000000-0000-0000-0000-000000000002',
  kidsFree: '50000000-0000-0000-0000-000000000003',
  checkedIn: '50000000-0000-0000-0000-000000000004',
  free: '50000000-0000-0000-0000-000000000005',
};

const TITLE = {
  untimed: 'Honesty Untimed Market',
  seatgeek: 'Honesty SeatGeek Show',
  kidsFree: 'Honesty Kids Free Concert',
  checkedIn: 'Honesty Checked In Show',
  free: 'Honesty Free Lawn Party',
};

function row(id: string, title: string, overrides: Record<string, unknown>) {
  return {
    id,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    date: utcFor(NEXT_WEEK, 24),
    end_date: null,
    enhanced_description: null,
    original_description: 'Supplied by events-card-honesty.spec.ts',
    event_start_local: `${NEXT_WEEK}T19:00:00`,
    event_start_utc: utcFor(NEXT_WEEK, 24),
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
    venue: 'Fixture Hall',
    writeup_generated_at: null,
    ...overrides,
  };
}

const ROWS = [
  // The no-time marker: 19:31:58 Central.
  row(ID.untimed, TITLE.untimed, {
    event_start_local: `${NEXT_WEEK}T19:31:58`,
    event_start_utc: utcFor(NEXT_WEEK, 24, 31, 58),
    date: utcFor(NEXT_WEEK, 24, 31, 58),
  }),
  // SeatGeek's placeholder: 03:30:00 Central, source on seatgeek.com.
  row(ID.seatgeek, TITLE.seatgeek, {
    event_start_local: `${NEXT_WEEK}T03:30:00`,
    source_url: 'https://seatgeek.com/honesty-show-tickets/123',
  }),
  row(ID.kidsFree, TITLE.kidsFree, { price: '$25; kids under 5 free' }),
  row(ID.checkedIn, TITLE.checkedIn, {}),
  row(ID.free, TITLE.free, { price: 'Free' }),
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range',
};

/** Every list read carries offset; each gets the five rows. Strip and the rest get none. */
async function installHonestyRows(page: Page, onListRequest?: (url: URL) => void) {
  await page.route('**/rest/v1/events?**', (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${ROWS.length}` }, body: '' });
    }
    if (url.searchParams.get('offset') === null) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '[]' });
    }
    onListRequest?.(url);
    const start = Number(url.searchParams.get('offset'));
    const slice = ROWS.slice(start);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'content-range': `${start}-${start + Math.max(slice.length, 1) - 1}/${ROWS.length}` },
      body: JSON.stringify(slice),
    });
  });
  // Three all-time check-ins on a show a week away.
  await page.route('**/rest/v1/event_live_stats?**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify([{ event_id: ID.checkedIn, total_checkins: 3, current_attendees: 0 }]),
    }),
  );
}

/**
 * A card's title link. Not the event-card-link test id: vite.config.ts strips
 * data-testid from every build (babel-plugin-react-remove-properties).
 */
function titleLink(page: Page, title: string): Locator {
  return page.locator('h3 > a[href^="/events/"], h4 > a[href^="/events/"]').filter({ hasText: title });
}

/** The card around a title's stretched link. */
function card(page: Page, title: string): Locator {
  return titleLink(page, title).locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " isolate ")][1]',
  );
}

test.describe('/events card honesty (pass 2, WP2)', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
    await installHonestyRows(page);
  });

  test('an untimed row says Time not listed, never All day', async ({ page }) => {
    await page.goto('/events');
    const untimed = card(page, TITLE.untimed);
    await expect(untimed).toBeVisible({ timeout: 30_000 });
    await expect(untimed).toContainText('Time not listed');
    await expect(untimed).not.toContainText('All day');
    await expect(untimed).not.toContainText('7:31 PM');
  });

  test("SeatGeek's 03:30 placeholder is not a showtime", async ({ page }) => {
    await page.goto('/events');
    const show = card(page, TITLE.seatgeek);
    await expect(show).toBeVisible({ timeout: 30_000 });
    await expect(show).toContainText('Time not listed');
    await expect(show).not.toContainText('3:30 AM');
  });

  test('a real time prints in Central with CT', async ({ page }) => {
    // 00:00Z is 7 PM in CDT and 6 PM in CST; read it the way the card does.
    const expected = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
    })
      .format(new Date(utcFor(NEXT_WEEK, 24)))
      // ICU puts a narrow no-break space before AM/PM; the card uses a plain one.
      .replace(/\s/g, ' ');
    await page.goto('/events');
    await expect(card(page, TITLE.checkedIn)).toContainText(`${expected} CT`, { timeout: 30_000 });
  });

  test('"$25; kids under 5 free" has no Free badge; plain "Free" does', async ({ page }) => {
    await page.goto('/events');
    const paid = card(page, TITLE.kidsFree);
    await expect(paid).toBeVisible({ timeout: 30_000 });
    await expect(paid.getByText('Free', { exact: true })).toHaveCount(0);
    await expect(paid).toContainText('$25; kids under 5 free');
    await expect(card(page, TITLE.free).getByText('Free', { exact: true })).toHaveCount(1);
  });

  test('three check-ins on next week\'s show are not LIVE', async ({ page }) => {
    await page.goto('/events');
    const show = card(page, TITLE.checkedIn);
    await expect(show).toContainText('3 checked in', { timeout: 30_000 });
    await expect(show.getByText('LIVE', { exact: true })).toHaveCount(0);
  });

  test('the title link carries the name and a dated slug', async ({ page }) => {
    await page.goto('/events');
    const link = titleLink(page, TITLE.free);
    await expect(link).toBeVisible({ timeout: 30_000 });
    await expect(link).toHaveAttribute('href', /^\/events\/honesty-free-lawn-party-\d{4}-\d{2}-\d{2}$/);
  });
});

test.describe('/events?price=free asks for free that is free', () => {
  test('the list request refuses a nonzero dollar amount', async ({ page }) => {
    const seen: URL[] = [];
    await installFixtureBackend(page);
    await installHonestyRows(page, (url) => seen.push(url));
    await page.goto('/events?price=free');
    await expect.poll(() => seen.length, { timeout: 30_000 }).toBeGreaterThan(0);
    const or = seen[0].searchParams.get('or') ?? '';
    expect(or).toContain('price.ilike.%free%');
    expect(or).toContain('price.not.match.[$] *[1-9]');
    expect(or).not.toContain('price.is.null');
  });
});
