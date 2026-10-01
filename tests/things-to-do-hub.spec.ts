import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP1: the /things-to-do hub.
 *
 * 1. Whatever pseo_pages answers ([] / every slug / a 500), every section
 *    above "More guides" has the same number of cards before and after the
 *    response, and only hrefs change. Layout shift over the page stays < 0.1.
 * 2. A 500 is reported (handleError -> the log-error sink, which only runs in
 *    a production build, which is what the smoke lane serves).
 * 3. At 390x844 a Today and a This Weekend link are on the first screen.
 * 4. Every Explore nav destination is linked from the page body.
 *
 * Explore pass 2 WP1 adds:
 * 5. One URL per intent: no /things-to-do/today, /this-weekend or /live-music
 *    link even when every pSEO page is published.
 * 6. The weekend line and /events/this-weekend share one windowed request and
 *    print the same number.
 * 7. Under the prerender flag nothing time-bound is on the page.
 * 8. Open now names what is open and how many have listed hours.
 * 9. At 390px every link in <main> is at least 44px tall.
 *
 * pseo_pages is overridden with page.route AFTER installFixtureBackend, which
 * the fixture documents as the way to win the match.
 */

const SECTIONS = ['when', 'audiences', 'areas', 'activities'] as const;

const EXPLORE_HREFS = ['/map', '/attractions', '/playgrounds', '/music', '/sports', '/outdoors', '/deals'];

const ALL_SLUGS = [
  'today', 'this-weekend', 'fall', 'winter', 'summer', 'spring',
  'east-village', 'west-des-moines', 'ankeny', 'urbandale', 'waukee', 'altoona',
  'families', 'date-night', 'foodies', 'budget', 'tourists',
  'live-music', 'festivals', 'arts-culture', 'outdoors', 'brunch',
  'downtown', 'drake', 'coffee', 'downtown/families',
].map((s) => ({ slug: `/things-to-do/${s}` }));

type Answer = 'empty' | 'full' | 'error';

/** Hold pseo_pages until `release()` so the before/after counts are real. */
async function gatePseo(page: Page, answer: Answer) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/rest/v1/pseo_pages**', async (route: Route) => {
    await gate;
    const headers = { 'access-control-allow-origin': '*' };
    if (answer === 'error') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ code: 'XX000', message: 'fixture failure' }),
      });
    }
    const rows = answer === 'full' ? ALL_SLUGS : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
      body: JSON.stringify(rows),
    });
  });
  return () => release();
}

async function installShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hubShift: number };
    w.__hubShift = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__hubShift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Not supported in this browser; the count assertions still run.
    }
  });
}

async function counts(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of SECTIONS) out[s] = await page.locator(`[data-hub-section="${s}"] > li`).count();
  return out;
}

for (const answer of ['empty', 'full', 'error'] as const) {
  test(`pseo_pages ${answer}: sections keep their card counts`, async ({ page }) => {
    await installFixtureBackend(page);
    const release = await gatePseo(page, answer);
    await installShiftObserver(page);

    const reported =
      answer === 'error'
        ? page.waitForRequest(
            (r) => r.url().includes('/functions/v1/log-error') && (r.postData() ?? '').includes('ThingsToDoHub'),
            { timeout: 30_000 },
          )
        : null;

    await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-hub-section="when"] > li').first()).toBeVisible({ timeout: 30_000 });
    const before = await counts(page);
    for (const s of SECTIONS) expect(before[s], s).toBeGreaterThan(0);

    const pseoResponse = page.waitForResponse('**/rest/v1/pseo_pages**');
    release();
    await pseoResponse;

    if (answer === 'full') {
      await expect(page.locator('#more-guides-heading')).toBeVisible();
      // One URL per intent: the hero chips keep the first-party landings.
      await expect(page.locator('nav[aria-label="When"] a[href="/events/today"]')).toHaveCount(1);
      for (const bad of ['/things-to-do/today', '/things-to-do/this-weekend', '/things-to-do/live-music']) {
        await expect(page.locator(`a[href="${bad}"]`), bad).toHaveCount(0);
      }
      // The redirected visitor path is never linked, even when "published".
      await expect(page.locator('a[href="/things-to-do/tourists"]')).toHaveCount(0);
    }
    if (answer === 'error') {
      await reported;
      await expect(page.locator('#more-guides-heading')).toHaveCount(0);
    }

    expect(await counts(page)).toEqual(before);

    const shift = await page.evaluate(() => (window as unknown as { __hubShift: number }).__hubShift);
    expect(shift).toBeLessThan(0.1);
  });
}

test('390x844: Today and This Weekend are on the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureBackend(page);
  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });

  for (const name of ['Today', 'This Weekend']) {
    const link = page.locator('nav[aria-label="When"]').getByRole('link', { name, exact: true });
    await expect(link).toBeInViewport({ timeout: 30_000 });
  }
});

test('links every Explore section and no redirect source', async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  const body = page.locator('section[aria-labelledby="explore-heading"]');
  await expect(body).toBeVisible({ timeout: 30_000 });
  for (const href of EXPLORE_HREFS) {
    await expect(body.locator(`a[href="${href}"]`), href).toHaveCount(1);
  }
  await expect(body.locator('a[aria-current="page"]')).toHaveAttribute('href', '/things-to-do');
  await expect(page.locator('a[href="/things-to-do/tourists"]')).toHaveCount(0);
  await expect(page.getByText(/most searched/i)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Explore pass 2 WP1
// ---------------------------------------------------------------------------

/** A Wednesday, 10 AM in Des Moines: no weekend day, attractions open. */
const WEDNESDAY_10AM = new Date('2026-09-30T15:00:00Z');

/**
 * The weekend line's projection (LANDING_LIGHT_COLUMNS), as supabase-js writes
 * it into the URL. Long enough not to match the Tonight rail's own events
 * query, which starts with the same six columns.
 */
const LIGHT_SELECT = 'select=id,title,date,event_start_utc,event_start_local,end_date,category,city,price,venue,location';

test('weekend line and /events/this-weekend: one windowed request, one number', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY_10AM);
  await installFixtureBackend(page);
  const windowed: string[] = [];
  page.on('request', (r) => {
    const url = decodeURIComponent(r.url());
    if (url.includes('/rest/v1/events') && url.includes(LIGHT_SELECT)) windowed.push(url);
  });

  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-hub-weekend-count]');
  await expect(line).toBeVisible({ timeout: 30_000 });
  const hubCount = await line.getAttribute('data-hub-weekend-count');
  await expect(line).toHaveText(`${hubCount} events this weekend`);

  // Client-side navigation, so the TanStack cache survives.
  await line.click();
  await expect(page).toHaveURL(/\/events\/this-weekend$/);
  const stat = page.getByText('Weekend Events', { exact: true }).locator('xpath=preceding-sibling::div[1]');
  await expect(stat).toHaveText(String(hubCount), { timeout: 30_000 });
  expect(windowed, windowed.join('\n')).toHaveLength(1);
});

test('free count links the weekend preset with the free filter', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY_10AM);
  await installFixtureBackend(page);
  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-hub-weekend-count]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('a[href="/events?preset=this-weekend&price=free"]')).toHaveText(/^\d+ free$/);
});

test('under the prerender flag nothing time-bound renders', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __DMI_PRERENDER__: boolean }).__DMI_PRERENDER__ = true;
  });
  await installFixtureBackend(page);
  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#by-area-heading')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: "See what's on this weekend" })).toBeVisible();
  await expect(page.getByText(/events this weekend|still to come this weekend/)).toHaveCount(0);
  await expect(page.getByText(/Open until/)).toHaveCount(0);
  await expect(page.locator('[data-open-now]')).toHaveCount(0);
  await expect(page.getByText(/\d+\+? this weekend/)).toHaveCount(0);
});

function attractionRow(i: number, hours: unknown) {
  return {
    id: `31000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Open Fixture ${i}`,
    type: 'Museum',
    location: 'Des Moines',
    latitude: 41.58,
    longitude: -93.62,
    rating: 4,
    is_active: true,
    is_free: i === 0,
    is_indoor: true,
    is_kid_friendly: false,
    hours,
    hours_summary: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const ALL_WEEK = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: '09:00', close: '17:00' }]),
);
const ALL_CLOSED = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, null]));

test('Open now: open rows, the listed-hours denominator, and the ?open=now link', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY_10AM);
  await installFixtureBackend(page);
  const rows = [
    attractionRow(0, ALL_WEEK),
    attractionRow(1, ALL_WEEK),
    attractionRow(2, ALL_WEEK),
    attractionRow(3, ALL_CLOSED),
    attractionRow(4, null), // no hours: left out of both numbers
  ];
  await page.route('**/rest/v1/attractions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': `0-${rows.length - 1}/${rows.length}`,
      },
      body: JSON.stringify(rows),
    }),
  );

  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  const block = page.locator('section[data-open-now]');
  await expect(block).toBeVisible({ timeout: 30_000 });
  await expect(block).toContainText('3 of 4 attractions with listed hours');
  await expect(block.locator('li')).toHaveCount(3);
  await expect(block.locator('li').first()).toContainText('Open until 5 PM');
  await expect(block.locator('a[href="/attractions?open=now"]')).toHaveCount(1);
});

// Scoped to the hub's own body, minus the Tonight rail: Header, Footer and
// TonightRail are shared components other plans own, and their links are
// tracked there (touch-targets.spec.ts runs the shell).
test('390x844: every hub link is at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(WEDNESDAY_10AM);
  await installFixtureBackend(page);
  await page.goto('/things-to-do', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#by-area-heading')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-hub-weekend-count]')).toBeVisible({ timeout: 30_000 });

  const short = await page.locator('main [data-hub-body] a[href]').evaluateAll((links) =>
    links
      .filter((a) => !a.closest('section[aria-labelledby="tonight-rail-heading"]'))
      .map((a) => ({ href: a.getAttribute('href'), h: a.getBoundingClientRect().height }))
      .filter((l) => l.h > 0 && l.h < 44),
  );
  expect(short, JSON.stringify(short)).toEqual([]);
});
