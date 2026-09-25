import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan pass 2, WP1 items 1-4, 6 and 14: the hub is never wrong about
 * now.
 *
 * - The list asks only for what isn't over: started in the last two hours,
 *   still running by end_date, or today's untimed marker (19:31:58 Central).
 * - The strip never counts down to that marker, is titled by the Central
 *   clock, and its rows aren't repeated in the list below.
 * - The prerendered HTML carries dates, never "Tonight" or "Starts in".
 *
 * The fixture doesn't filter (see tests/support/fixtureBackend.ts), so the
 * list's rule is checked on the request it sends; what is asserted on the
 * page is what the page does with the rows it gets.
 */

// Friday 2026-09-25, 20:00 CDT.
const FRI_8PM = new Date('2026-09-26T01:00:00Z');
// Friday 2026-09-25, 18:50 CDT.
const FRI_650PM = new Date('2026-09-25T23:50:00Z');

function event(n: number, title: string, utc: string, local: string, endDate: string | null = null) {
  return {
    id: `60000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    date: utc,
    event_start_utc: utc,
    event_start_local: local,
    end_date: endDate,
    enhanced_description: null,
    original_description: 'Supplied by events-hub-clock.spec.ts',
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
    venue: `Clock Venue ${n}`,
    writeup_generated_at: null,
  };
}

const FESTIVAL = event(1, 'Clock Festival', '2026-09-24T15:00:00Z', '2026-09-24T10:00:00', '2026-09-28T03:00:00Z');
const SEVEN_PM = event(2, 'Clock Seven PM Show', '2026-09-26T00:00:00Z', '2026-09-25T19:00:00');
const UNTIMED = event(3, 'Clock Untimed Listing', '2026-09-26T00:31:58Z', '2026-09-25T19:31:58');
const SEVEN_THIRTY = event(4, 'Clock Seven Thirty Show', '2026-09-26T00:30:00Z', '2026-09-25T19:30:00');
const NINE_PM = event(5, 'Clock Nine PM Show', '2026-09-26T02:00:00Z', '2026-09-25T21:00:00');
const TOMORROW = event(6, 'Clock Saturday Matinee', '2026-09-26T19:00:00Z', '2026-09-26T14:00:00');

type Row = ReturnType<typeof event>;

interface Answers {
  list: Row[];
  soon: Row[];
  running: Row[];
}

/** Answer each of the hub's events reads by its shape; record the list request. */
async function installClockEvents(page: Page, answers: Answers): Promise<string[]> {
  const listUrls: string[] = [];
  await page.route('**/rest/v1/events?**', (route: Route) => {
    const url = new URL(route.request().url());
    const p = url.searchParams;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    };
    const send = (rows: Row[]) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
        body: route.request().method() === 'HEAD' ? '' : JSON.stringify(rows),
      });
    if (p.get('offset') !== null) {
      listUrls.push(url.toString());
      return send(answers.list);
    }
    if (p.get('is_sponsored')) return send([]);
    if (p.get('end_date')?.startsWith('gte.') && p.get('date')?.startsWith('lt.')) return send(answers.running);
    const dates = p.getAll('date');
    if (dates.some((d) => d.startsWith('gte.')) && dates.some((d) => d.startsWith('lte.'))) {
      return send(answers.soon);
    }
    return send([]);
  });
  return listUrls;
}

/**
 * A card's title link. Not the event-card-link test id: vite.config.ts strips
 * data-testid from every build, dev server included.
 */
const CARD_LINKS = 'h3 > a[href^="/events/"], h4 > a[href^="/events/"]';

const strip = (page: Page) => page.locator('section[aria-labelledby="tonight-strip-heading"]');

test.describe('/events at Fri 20:00 CDT', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FRI_8PM);
    await installFixtureBackend(page);
  });

  test('the list asks only for what is not over, and the strip rows are not repeated', async ({ page }) => {
    const listUrls = await installClockEvents(page, {
      list: [FESTIVAL, SEVEN_PM, UNTIMED, NINE_PM, TOMORROW],
      soon: [NINE_PM],
      running: [FESTIVAL],
    });
    await page.goto('/events');

    await expect(strip(page).getByRole('heading', { name: 'Tonight, Fri Sep 25' })).toBeVisible({ timeout: 30_000 });
    await expect(strip(page).getByText('Starts in 1 hr')).toBeVisible();
    await expect(strip(page).getByText('Happening now')).toBeVisible();

    const or = new URL(listUrls[0]).searchParams.get('or');
    expect(or).toBe(
      '(date.gte.2026-09-25T23:00:00.000Z,end_date.gte.2026-09-26T01:00:00.000Z,date.eq.2026-09-26T00:31:58.000Z)'
    );

    // Under "Tonight": the 7 PM show and the untimed listing; the festival
    // and the 9 PM show are in the strip above, and the list says so.
    const tonight = page.getByRole('region', { name: /^Tonight\s*,\s*\d+ events?$/ });
    await expect(tonight.locator(CARD_LINKS)).toHaveCount(2);
    await expect(tonight).toContainText('And 2 more today in the strip above.');
    await expect(page.locator('h3', { hasText: /^Tomorrow/ })).toBeVisible();

    const hrefs = await page.locator(CARD_LINKS).evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')),
    );
    expect(new Set(hrefs).size, 'an event rendered twice').toBe(hrefs.length);
  });
});

test.describe('/events at Fri 18:50 CDT', () => {
  test('the strip says "time not listed" for the 19:31:58 marker, never "Starts in 41 min"', async ({ page }) => {
    await page.clock.setFixedTime(FRI_650PM);
    await installFixtureBackend(page);
    await installClockEvents(page, {
      list: [SEVEN_THIRTY, UNTIMED, TOMORROW],
      soon: [SEVEN_THIRTY, UNTIMED],
      running: [],
    });
    await page.goto('/events');

    await expect(strip(page).getByRole('heading', { name: 'Tonight, Fri Sep 25' })).toBeVisible({ timeout: 30_000 });
    const cards = strip(page).locator('ul[aria-label] > li');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Starts in 40 min');
    await expect(cards.nth(1)).toContainText('Today, time not listed');
    await expect(page.getByText('Starts in 41 min')).toHaveCount(0);
  });
});

test.describe('/events in the morning', () => {
  test('the strip is "Starting soon" before 16:00 Central', async ({ page }) => {
    // Friday 2026-09-25, 09:00 CDT.
    await page.clock.setFixedTime(new Date('2026-09-25T14:00:00Z'));
    await installFixtureBackend(page);
    const tenAm = event(7, 'Clock Morning Talk', '2026-09-25T15:00:00Z', '2026-09-25T10:00:00');
    await installClockEvents(page, { list: [tenAm, TOMORROW], soon: [tenAm], running: [] });
    await page.goto('/events');
    await expect(strip(page).getByRole('heading', { name: 'Starting soon' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^Tonight/ })).toHaveCount(0);
  });
});

test.describe('/events in the prerender', () => {
  test('no strip and no relative day words in the static HTML', async ({ page }) => {
    await page.clock.setFixedTime(FRI_8PM);
    await page.addInitScript(() => {
      (window as unknown as { __DMI_PRERENDER__: boolean }).__DMI_PRERENDER__ = true;
    });
    await installFixtureBackend(page);
    await installClockEvents(page, {
      list: [SEVEN_PM, UNTIMED, TOMORROW],
      soon: [NINE_PM],
      running: [FESTIVAL],
    });
    await page.goto('/events');

    await expect(page.locator('h3', { hasText: /^Friday, Sep 25/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('h3', { hasText: /^Saturday, Sep 26/ })).toBeVisible();
    await expect(page.locator('h3', { hasText: /^(Tonight|Today|Tomorrow)\b/ })).toHaveCount(0);
    await expect(strip(page)).toHaveCount(0);
    await expect(page.getByText(/Starts in/)).toHaveCount(0);
  });
});
