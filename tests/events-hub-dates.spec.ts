import { test, expect, type Page, type Request } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan WP1 items 1 and 5: /events asks for Central-time windows.
 *
 * events.date is TIMESTAMPTZ. The hub used to send `date=eq.<UTC yyyy-mm-dd>`
 * for Today, which after 7pm Central named tomorrow; "This weekend" was
 * Sat-Sun and jumped to next week on a Sunday. These tests freeze the clock,
 * load a URL and read the bounds the list query actually sent.
 *
 * The fixture backend doesn't filter, so asserting on rendered rows would
 * prove nothing about the window. The request is the contract.
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

function dateBounds(params: URLSearchParams): string[] {
  return params.getAll('date').sort();
}

test.describe('/events Central-time windows (WP1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SAT_830PM_CDT);
    await installFixtureBackend(page);
  });

  test('?preset=today is Saturday in Central, so a 9pm show is inside it', async ({ page }) => {
    const params = await listParams(page, '/events?preset=today');
    expect(dateBounds(params)).toEqual([
      'gte.2026-09-26T05:00:00.000Z',
      'lte.2026-09-27T04:59:59.999Z',
    ]);
    // A 21:00 CDT show on Saturday is 02:00Z Sunday: inside the bounds.
    expect('2026-09-27T02:00:00.000Z' <= '2026-09-27T04:59:59.999Z').toBe(true);
  });

  test('?preset=this-weekend on a Saturday is the current Fri-Sun', async ({ page }) => {
    const params = await listParams(page, '/events?preset=this-weekend');
    expect(dateBounds(params)).toEqual([
      'gte.2026-09-25T05:00:00.000Z',
      'lte.2026-09-28T04:59:59.999Z',
    ]);
  });

  test('the hub weekend matches /events/this-weekend', async ({ page }) => {
    const hub = dateBounds(await listParams(page, '/events?preset=this-weekend'));

    const landing = page.waitForRequest(
      (req) => req.url().includes('/rest/v1/events?') && /[?&]date=gte\./.test(req.url()),
      { timeout: 30_000 }
    );
    await page.goto('/events/this-weekend');
    const landingBounds = dateBounds(new URL((await landing).url()).searchParams);
    expect(landingBounds).toEqual(hub);
  });

  test('a picked date is exactly that Central day', async ({ page }) => {
    const params = await listParams(page, '/events?from=2026-10-03');
    expect(dateBounds(params)).toEqual([
      'gte.2026-10-03T05:00:00.000Z',
      'lte.2026-10-04T04:59:59.999Z',
    ]);
  });

  test('no date filter keeps multi-day events that started earlier', async ({ page }) => {
    const params = await listParams(page, '/events');
    expect(params.get('or')).toBe(
      '(date.gte.2026-09-26T05:00:00.000Z,end_date.gte.2026-09-27T01:30:00.000Z)'
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

  test('"Free This Weekend" sets price and date together', async ({ page }) => {
    await page.goto('/events');
    const preset = page.getByRole('button', { name: /free this weekend/i });
    await expect(preset).toBeVisible({ timeout: 30_000 });
    const before = await page.evaluate(() => history.length);

    await preset.click();
    await expect(page).toHaveURL(/[?&]price=free\b/);
    await expect(page).toHaveURL(/[?&]preset=this-weekend\b/);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await expect(preset).toHaveAttribute('aria-pressed', 'true');
  });

  test('the Tonight chip sets today and a second press clears it', async ({ page }) => {
    await page.goto('/events');
    const tonight = page.getByRole('group', { name: 'Quick filters' }).getByRole('button', { name: 'Tonight' });
    await expect(tonight).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await tonight.click();
    await expect(page).toHaveURL(/[?&]preset=today\b/);
    await expect(tonight).toHaveAttribute('aria-pressed', 'true');
    await tonight.click();
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
