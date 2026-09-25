import { test, expect, type Page, type Request } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * /search, the destination of the site's main search box (search plan WP2).
 *
 * The rows come from tests/support/fixtureBackend plus a stubbed nlp-search
 * body with all four types. The stub is registered AFTER installFixtureBackend,
 * so it wins (Playwright gives the most recently registered route priority),
 * and every call is counted, so "no second model call" is a number, not a hope.
 *
 * A request that carries `intent` skips the model (WP1 item 10), so the
 * model-backed count is the number of bodies without it.
 */

const EVENT_ID = '40000000-0000-0000-0000-000000000001';
const ATTRACTION_ID = '40000000-0000-0000-0000-000000000002';
const RESTAURANT_ID = '40000000-0000-0000-0000-000000000003';
const HOTEL_ID = '40000000-0000-0000-0000-000000000004';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface StubOptions {
  status?: number;
  appliedFilters?: { key: string; label: string }[];
  unappliedFilters?: string[];
}

function nlpBody(query: string, opts: StubOptions) {
  return {
    success: true,
    query,
    parsedIntent: {
      contentTypes: ['events', 'restaurants', 'attractions', 'hotels'],
      keywords: ['jazz'],
      dateFilter: opts.appliedFilters?.some((f) => f.key === 'when') ? 'today' : undefined,
      confidence: 0.9,
      originalQuery: query,
    },
    results: {
      events: [
        {
          id: EVENT_ID,
          title: 'Jazz on the River',
          // 7pm Central on Thursday Oct 1 is midnight UTC on Oct 2: the card
          // and the slug must both say Oct 1.
          date: '2026-10-02T00:00:00Z',
          event_start_utc: '2026-10-02T00:00:00Z',
          event_start_local: '2026-10-01T19:00:00',
          venue: 'Principal Riverwalk',
          price: 'Free',
          latitude: 41.5868,
          longitude: -93.625,
        },
      ],
      restaurants: [
        {
          id: RESTAURANT_ID,
          name: 'Jazz Kitchen',
          slug: 'jazz-kitchen',
          cuisine: 'Cajun',
          price_range: '$$',
          status: 'opening_soon',
        },
      ],
      // No slug on purpose: the link must fall back to the slugged name, never the id.
      attractions: [{ id: ATTRACTION_ID, name: 'Jazz Hall of Fame', type: 'Museum', is_free: true }],
      hotels: [{ id: HOTEL_ID, name: 'Riverfront Jazz Hotel', slug: 'riverfront-jazz-hotel', area: 'Downtown', avg_nightly_rate: 159 }],
    },
    ...(opts.appliedFilters ? { appliedFilters: opts.appliedFilters } : {}),
    ...(opts.unappliedFilters ? { unappliedFilters: opts.unappliedFilters } : {}),
    matchType: 'understood',
    metadata: { totalResults: 4, responseTimeMs: 5, modelUsed: 'stub' },
  };
}

function bodyOf(request: Request): Record<string, unknown> {
  try {
    return (request.postDataJSON() as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function stubSearch(page: Page, opts: StubOptions = {}) {
  const bodies: Record<string, unknown>[] = [];
  await installFixtureBackend(page);
  // hotels is not in the fixture tables. One hotel next to the event venue, for
  // the Stay line and the keyword leg.
  await page.route('**/rest/v1/hotels**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
      body: JSON.stringify([
        {
          id: HOTEL_ID,
          name: 'Riverfront Jazz Hotel',
          slug: 'riverfront-jazz-hotel',
          city: 'Des Moines',
          area: 'Downtown',
          latitude: 41.5872,
          longitude: -93.6245,
        },
      ]),
    }),
  );
  await page.route('**/functions/v1/nlp-search**', (route) => {
    const body = bodyOf(route.request());
    bodies.push(body);
    if (opts.status && opts.status !== 200) {
      return route.fulfill({
        status: opts.status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ success: false, error: 'Search failed', code: 'internal' }),
      });
    }
    // A removal re-query answers without the facet it dropped, as WP1 would.
    const served = body.intent
      ? { ...opts, appliedFilters: opts.appliedFilters?.filter((f) => f.key !== 'when') }
      : opts;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(nlpBody(String(body.query ?? ''), served)),
    });
  });
  return {
    bodies,
    modelCalls: () => bodies.filter((b) => !b.intent).length,
  };
}

const results = (page: Page) => page.locator('[data-result-type]');

test.describe('/search results', () => {
  test('every card links to a page that resolves, never /attractions/<uuid>', async ({ page }) => {
    await stubSearch(page);
    await page.goto('/search?q=jazz');
    await expect(page.getByRole('heading', { level: 2, name: /^Places to stay/ })).toBeVisible({ timeout: 30_000 });

    const hrefs = await page.locator('[data-result-type] h3 a').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') ?? ''),
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const href of hrefs) {
      expect(href).toMatch(
        /^\/(events\/[a-z0-9-]+-\d{4}-\d{2}-\d{2}|attractions\/[a-z0-9-]+|restaurants\/[a-z0-9-]+|stay\/[a-z0-9-]+)$/,
      );
      expect(href.startsWith('/attractions/') && UUID.test(href), `${href} links an attraction by id`).toBe(false);
    }
    expect(hrefs).toContain('/events/jazz-on-the-river-2026-10-01');
    expect(hrefs).toContain('/attractions/jazz-hall-of-fame');
    expect(hrefs).toContain('/stay/riverfront-jazz-hotel');
  });

  test('an event card shows its Central date and time, and results are grouped by type', async ({ page }) => {
    await stubSearch(page);
    await page.goto('/search?q=jazz');
    const event = results(page).filter({ hasText: 'Jazz on the River' });
    await expect(event).toContainText('Thu, Oct 1 @ 7:00 PM', { timeout: 30_000 });
    await expect(event).toContainText('Stay: Riverfront Jazz Hotel');
    await expect(event).toContainText('(straight line)');

    for (const name of ['Events', 'Restaurants', 'Places', 'Places to stay']) {
      await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${name} (\\d+|Top \\d+)$`) })).toBeVisible();
    }
    await expect(results(page).filter({ hasText: 'Jazz Kitchen' })).toContainText('Opening soon');
  });

  test('applied filters render as removable chips, unapplied ones as one muted line', async ({ page }) => {
    await stubSearch(page, {
      appliedFilters: [{ key: 'when', label: 'Tonight' }],
      unappliedFilters: ['pet-friendly'],
    });
    await page.goto('/search?q=jazz%20tonight');
    await expect(page.getByRole('button', { name: 'Remove Tonight' })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByText('Not filtered: pet-friendly')).toBeVisible();
  });

  test('a deployment without appliedFilters shows no chips and no "Understood" line', async ({ page }) => {
    await stubSearch(page);
    await page.goto('/search?q=jazz');
    await expect(page.getByRole('status')).toContainText('results for "jazz"', { timeout: 30_000 });
    await expect(page.getByText(/Understood/)).toHaveCount(0);
    await expect(page.getByText('Filtered by')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  });

  test('a 500 from nlp-search shows keyword matches and no alert', async ({ page }) => {
    await stubSearch(page, { status: 500 });
    await page.goto('/search?q=jazz');
    // fixtureBackend's first event and restaurant carry "Jazz".
    await expect(results(page).filter({ hasText: 'Jazz Night at the Fixture' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('Showing keyword matches');
    await expect(page.locator('#main-content [role="alert"]')).toHaveCount(0);
  });

  test('opening a result and pressing Back makes no new nlp-search request', async ({ page }) => {
    const stub = await stubSearch(page);
    await page.goto('/search?q=jazz');
    const link = page.getByRole('link', { name: 'Jazz Hall of Fame' });
    await expect(link).toBeVisible({ timeout: 30_000 });
    expect(stub.bodies.length).toBe(1);

    await link.click();
    await expect(page).toHaveURL(/\/attractions\/jazz-hall-of-fame$/);
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Jazz Hall of Fame' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_000);
    expect(stub.bodies.length, 'Back re-ran the search').toBe(1);
  });

  test('removing a chip re-queries with the stored intent, not the model', async ({ page }) => {
    const stub = await stubSearch(page, { appliedFilters: [{ key: 'when', label: 'Tonight' }] });
    await page.goto('/search?q=jazz%20tonight');
    const chip = page.getByRole('button', { name: 'Remove Tonight' });
    await expect(chip).toBeVisible({ timeout: 30_000 });

    const refined = page.waitForRequest(
      (r) => r.url().includes('/functions/v1/nlp-search') && Boolean(bodyOf(r).intent),
    );
    await chip.click();
    const request = await refined;
    const intent = bodyOf(request).intent as { dateFilter?: string; keywords?: string[] };
    expect(intent.dateFilter).toBeUndefined();
    expect(intent.keywords).toEqual(['jazz']);
    await expect(page).toHaveURL(/drop=when/);
    await expect(page.getByRole('button', { name: 'Remove Tonight' })).toHaveCount(0);
    expect(stub.modelCalls(), 'chip removal made a model-backed request').toBe(1);
  });

  test('type tabs narrow to one section and live in the URL', async ({ page }) => {
    await stubSearch(page);
    await page.goto('/search?q=jazz');
    await page.getByRole('group', { name: 'Result type' }).getByRole('button', { name: /^Places to stay/ }).click();
    await expect(page).toHaveURL(/type=stay/);
    await expect(page.getByRole('heading', { level: 2, name: /^Events/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^Places to stay/ })).toBeVisible();
  });

  test('the example chips can be reached with Tab and fire on Enter', async ({ page }) => {
    await stubSearch(page);
    await page.goto('/search');
    const input = page.getByRole('searchbox', { name: 'Search Des Moines' });
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.focus();

    let label = '';
    for (let i = 0; i < 6 && !label; i++) {
      await page.keyboard.press('Tab');
      label = await page.evaluate(() => {
        const el = document.activeElement;
        return el instanceof HTMLButtonElement && el.closest('form') === null ? el.textContent?.trim() ?? '' : '';
      });
    }
    expect(label, 'no example chip took focus').not.toBe('');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(input).toHaveValue(label);
  });
});
