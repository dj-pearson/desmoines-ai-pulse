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
      await expect(page.locator('[data-hub-section="when"] a[href="/things-to-do/today"]')).toHaveCount(1);
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
  await expect(page.locator('a[href="/things-to-do/tourists"]')).toHaveCount(0);
  await expect(page.getByText(/most searched/i)).toHaveCount(0);
});
