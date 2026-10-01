import { test, expect, type Page, type Request, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan WP1 (first pass items 1 and 5; second pass items 1, 4 and 5):
 * /events asks for Central-time windows, keeps festivals already running when
 * the window opens (as /events/this-weekend does), and drops what's over.
 *
 * events.date is TIMESTAMPTZ. The hub used to send `date=eq.<UTC yyyy-mm-dd>`
 * for Today, which after 7pm Central named tomorrow; "This weekend" was
 * Sat-Sun and jumped to next week on a Sunday. These tests freeze the clock,
 * load a URL and read the bounds the list query actually sent.
 *
 * The fixture backend doesn't filter, so asserting on rendered rows would
 * prove nothing about the window. The request is the contract. The one test
 * that compares rendered ids serves both pages the same rows, including a
 * Thu-Sun festival, and checks both ask for running festivals and show the
 * same set.
 */

// Saturday 2026-09-26, 20:30 CDT.
const SAT_830PM_CDT = new Date('2026-09-27T01:30:00Z');

/** The hub's list request is the one that pages (it carries offset). */
function isListRequest(req: Request): boolean {
  const url = req.url();
  return url.includes('/rest/v1/events?') && /[?&]offset=/.test(url) && req.method() === 'GET';
}

async function listParams(page: Page, path: string): Promise<URLSearchParams> {
  const waiting = page.waitForRequest(isListRequest, { timeout: 30_000 });
  await page.goto(path);
  const req = await waiting;
  return new URL(req.url()).searchParams;
}

/**
 * A window's two bounds as `gte.<start>` / `lte.<end>`. The lower bound is the
 * head of an or() - `date.gte."<from>",and(date.lt."<from>",end_date.gte."<from>")` -
 * so a festival running at the start is kept; the upper bound is `date=lte.`.
 */
function windowBounds(params: URLSearchParams): string[] {
  const or = params.get('or') ?? '';
  const from = /date\.gte\."([^"]+)",and\(date\.lt\."\1",end_date\.gte\."\1"\)/.exec(or)?.[1];
  return [...(from ? [`gte.${from}`] : []), ...params.getAll('date')].sort();
}

test.describe('/events Central-time windows (WP1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SAT_830PM_CDT);
    await installFixtureBackend(page);
  });

  test('?preset=today is Saturday in Central, so a 9pm show is inside it', async ({ page }) => {
    const params = await listParams(page, '/events?preset=today');
    expect(windowBounds(params)).toEqual([
      'gte.2026-09-26T05:00:00.000Z',
      'lte.2026-09-27T04:59:59.999Z',
    ]);
    // A 21:00 CDT show on Saturday is 02:00Z Sunday: inside the bounds.
    expect('2026-09-27T02:00:00.000Z' <= '2026-09-27T04:59:59.999Z').toBe(true);
  });

  test('a window that holds now also drops what is over', async ({ page }) => {
    const params = await listParams(page, '/events?preset=today');
    // Started in the last 2h, still running, or today's untimed marker
    // (Sat 19:31:58 CDT).
    expect(params.get('or')).toContain(
      'or(date.gte.2026-09-26T23:30:00.000Z,end_date.gte.2026-09-27T01:30:00.000Z,date.eq.2026-09-27T00:31:58.000Z)'
    );
  });

  test('?preset=this-weekend on a Saturday is the current Fri-Sun', async ({ page }) => {
    const params = await listParams(page, '/events?preset=this-weekend');
    expect(windowBounds(params)).toEqual([
      'gte.2026-09-25T05:00:00.000Z',
      'lte.2026-09-28T04:59:59.999Z',
    ]);
  });

  test('the hub weekend matches /events/this-weekend, running festival included', async ({ page }) => {
    // Registered after installFixtureBackend, so it wins for events reads.
    const base = {
      category: 'Festivals',
      city: 'Des Moines',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      enhanced_description: null,
      original_description: 'Supplied by events-hub-dates.spec.ts',
      event_timezone: 'America/Chicago',
      image_url: null,
      is_enhanced: false,
      is_featured: false,
      is_sponsored: false,
      sponsored_until: null,
      latitude: 41.58,
      longitude: -93.62,
      location: 'Des Moines',
      price: '$10',
      source_url: 'https://example.com/fixture',
      writeup_generated_at: null,
    };
    const rows = [
      {
        ...base,
        id: '50000000-0000-0000-0000-000000000001',
        title: 'Thursday to Sunday Festival',
        date: '2026-09-24T15:00:00Z',
        event_start_utc: '2026-09-24T15:00:00Z',
        event_start_local: '2026-09-24T10:00:00',
        end_date: '2026-09-28T03:00:00Z',
        venue: 'Western Gateway Park',
      },
      {
        ...base,
        id: '50000000-0000-0000-0000-000000000002',
        title: 'Saturday Late Show',
        date: '2026-09-27T02:00:00Z',
        event_start_utc: '2026-09-27T02:00:00Z',
        event_start_local: '2026-09-26T21:00:00',
        end_date: null,
        venue: 'Wooly\'s',
      },
      {
        ...base,
        id: '50000000-0000-0000-0000-000000000003',
        title: 'Sunday Brunch Concert',
        date: '2026-09-27T16:00:00Z',
        event_start_utc: '2026-09-27T16:00:00Z',
        event_start_local: '2026-09-27T11:00:00',
        end_date: null,
        venue: 'Hoyt Sherman Place',
      },
    ];
    const seen: string[] = [];
    await page.route('**/rest/v1/events?**', (route: Route) => {
      seen.push(route.request().url());
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': `0-${rows.length - 1}/${rows.length}`,
      };
      if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
      const url = new URL(route.request().url());
      // The sponsored lead and the indoor lookup get nothing.
      const body = url.searchParams.get('is_sponsored') || url.searchParams.get('select') === 'id,is_indoor' ? [] : rows;
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
    });

    const titlesOn = async (path: string) => {
      await page.goto(path);
      // Title links, not the event-card-link test id: vite.config.ts strips
      // data-testid from every build.
      const links = page.locator('h3 > a[href^="/events/"], h4 > a[href^="/events/"]');
      await expect(links.first()).toBeVisible({ timeout: 30_000 });
      const texts = await links.allTextContents();
      return [...new Set(texts.map((t) => t.replace(/^Sponsored: /, '').trim()))].sort();
    };

    const hub = await titlesOn('/events?preset=this-weekend');
    const hubParams = new URL(seen.filter((u) => /[?&]offset=/.test(u)).pop() ?? 'http://x').searchParams;
    seen.length = 0;
    const landing = await titlesOn('/events/this-weekend');

    expect(hub).toEqual(rows.map((r) => r.title).sort());
    expect(landing).toEqual(hub);

    // Both ask for festivals running at Friday 00:00 Central, with the same bounds.
    const landingUrl = seen.find((u) => {
      const p = new URL(u).searchParams;
      return /^lte\./.test(p.get('date') ?? '') && (p.get('or') ?? '').includes('end_date.gte.');
    });
    expect(landingUrl, 'the landing sent no windowed request').toBeTruthy();
    expect(windowBounds(new URL(landingUrl!).searchParams)).toEqual(windowBounds(hubParams));
  });

  test('a picked date is exactly that Central day', async ({ page }) => {
    const params = await listParams(page, '/events?from=2026-10-03');
    expect(windowBounds(params)).toEqual([
      'gte.2026-10-03T05:00:00.000Z',
      'lte.2026-10-04T04:59:59.999Z',
    ]);
  });

  test('an inverted range is read the right way round', async ({ page }) => {
    const params = await listParams(page, '/events?from=2026-10-05&to=2026-10-03');
    expect(windowBounds(params)).toEqual([
      'gte.2026-10-03T05:00:00.000Z',
      'lte.2026-10-06T04:59:59.999Z',
    ]);
  });

  test('no date filter: not over yet, and multi-day events still running', async ({ page }) => {
    const params = await listParams(page, '/events');
    expect(params.get('or')).toBe(
      '(date.gte.2026-09-26T23:30:00.000Z,end_date.gte.2026-09-27T01:30:00.000Z,date.eq.2026-09-27T00:31:58.000Z)'
    );
  });

  test('free never means "no price"', async ({ page }) => {
    const params = await listParams(page, '/events?price=free&preset=today');
    const or = params.get('or') ?? '';
    expect(or).toContain('price.ilike.%free%');
    expect(or).not.toContain('price.is.null');
  });
});

test.describe('/events presets write one history entry (WP1 item 5)', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
  });

  test('"Free This Weekend" in the filters sheet sets price and date together', async ({ page }) => {
    await page.goto('/events');
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter events' });
    const preset = sheet.getByRole('button', { name: /free this weekend/i });
    await expect(preset).toBeVisible({ timeout: 30_000 });
    const before = await page.evaluate(() => history.length);

    await preset.click();
    await expect(page).toHaveURL(/[?&]price=free\b/);
    await expect(page).toHaveURL(/[?&]preset=this-weekend\b/);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await expect(preset).toHaveAttribute('aria-pressed', 'true');
  });

  test('the Today chip sets today and a second press clears it', async ({ page }) => {
    await page.goto('/events');
    const today = page.getByRole('group', { name: 'Quick filters' }).getByRole('button', { name: 'Today' });
    await expect(today).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await today.click();
    await expect(page).toHaveURL(/[?&]preset=today\b/);
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await today.click();
    await expect(page).not.toHaveURL(/[?&]preset=/);
  });

  test('Esc in the page leaves the filters alone', async ({ page }) => {
    await page.goto('/events?category=Music&price=free&preset=today');
    await expect(page.getByRole('button', { name: /remove .*music/i }).first()).toBeVisible({ timeout: 30_000 });
    await page.locator('body').press('Escape');
    await expect(page).toHaveURL(/category=Music/);
    await expect(page).toHaveURL(/price=free/);
    await expect(page).toHaveURL(/preset=today/);
  });
});
