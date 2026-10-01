import { test, expect, type Page, type Request, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home pass-2 WP3 (docs/page-plans/home-pass2.md): rails, dashboard and
 * MostSearched honesty.
 *
 * 1. The anonymous For You rail reads `events` (ordered by trending_score) and
 *    never calls get_trending_events, and it asks for the three unpublish
 *    switches. The handler below hands back a hidden row whenever the request
 *    forgets to filter it, so "never renders" is a statement about the query.
 * 2. An active sponsored row says "Sponsored" in the For You rail, the
 *    dashboard and MostSearched; MostSearched shows at most one per column.
 * 3. After a full scroll an anonymous visitor has made no trending_scores or
 *    search_analytics request, and the dashboard plus MostSearched made 8 or
 *    fewer requests.
 * 4. No event detail href appears twice on `/`: the For You rail drops
 *    tonight's events and the dashboard drops both.
 *
 * The clock is fixed at Thursday 2026-10-01 18:00 CDT so "tonight" and "this
 * weekend" are known. Runs against the fixture backend.
 */

const NOW = new Date('2026-10-01T23:00:00Z'); // Thu 18:00 CDT
const ISO = '2026-01-01T00:00:00Z';
const FUTURE = '2027-01-01T00:00:00Z';

function event(id: string, title: string, startUtc: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    date: startUtc,
    event_start_utc: startUtc,
    event_start_local: null,
    event_timezone: 'America/Chicago',
    end_date: null,
    category: 'Music',
    city: 'Des Moines',
    location: 'Des Moines',
    venue: 'Fixture Hall',
    price: '$10',
    image_url: null,
    source_url: null,
    enhanced_description: null,
    original_description: 'Supplied by tests/home-rails-honesty.spec.ts.',
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    is_hidden: false,
    trending_score: null,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
    writeup_generated_at: null,
    ...extra,
  };
}

const id = (n: number) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Tonight, 20:00 CDT. Also returned by the For You read: it must show once.
const TONIGHT_SHOW = event(id(1), 'Tonight Shared Show', '2026-10-02T01:00:00Z');
const FY_SPONSORED = event(id(2), 'Paid Placement Gala', '2026-10-06T00:00:00Z', {
  is_sponsored: true,
  sponsored_until: FUTURE,
});
const FY_HIDDEN = event(id(3), 'Hidden Row Must Not Render', '2026-10-06T01:00:00Z', { is_hidden: true });
// Returned by both the For You read and the dashboard read.
const FY_SHARED = event(id(4), 'Rail And Dashboard Shared', '2026-10-03T18:00:00Z');
const DASH_SPONSORED = event(id(5), 'Sponsored Saturday Market', '2026-10-03T15:00:00Z', {
  is_sponsored: true,
  sponsored_until: FUTURE,
});
const DASH_PLAIN = event(id(6), 'Sunday Symphony', '2026-10-04T19:00:00Z');
const DASH_PLAIN_2 = event(id(7), 'Saturday Street Fair', '2026-10-03T20:00:00Z');

function restaurant(n: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `71000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: 'Supplied by tests/home-rails-honesty.spec.ts.',
    cuisine: 'American',
    price_range: '$$',
    city: 'Des Moines',
    image_url: null,
    rating: 4.6,
    is_featured: false,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
    data_quality_score: 80,
    enhanced: false,
    google_place_id: null,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    location: 'Des Moines',
    merged_at: null,
    merged_into: null,
    opening: true,
    opening_date: null,
    opening_timeframe: null,
    phone: null,
    popularity_score: 0,
    source_url: null,
    status: 'active',
    website: null,
    writeup_generated_at: null,
    ...extra,
  };
}

const RATED = [
  restaurant(1, 'Sponsored Steakhouse One', { is_sponsored: true, sponsored_until: FUTURE }),
  restaurant(2, 'Sponsored Steakhouse Two', { is_sponsored: true, sponsored_until: FUTURE }),
  restaurant(3, 'Organic Diner'),
  restaurant(4, 'Organic Bistro'),
];

async function json(route: Route, rows: unknown[]) {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    },
    body: JSON.stringify(rows),
  });
}

/** The fixture routes this spec needs, on top of the generic fixture backend. */
async function installHonestyBackend(page: Page) {
  await page.clock.setFixedTime(NOW);
  await installFixtureBackend(page);

  await page.route('**/rest/v1/events?*', (route) => {
    const url = decodeURIComponent(route.request().url());
    // For You, anonymous: ordered by the measured score.
    if (url.includes('order=trending_score')) {
      const rows = [TONIGHT_SHOW, FY_SPONSORED, FY_SHARED];
      // Only a request that forgets the unpublish switches gets the hidden row.
      if (!url.includes('is_hidden=neq.true')) rows.push(FY_HIDDEN);
      return json(route, rows);
    }
    // Tonight: the ongoing-or-starting filter.
    if (url.includes('end_date.gte')) return json(route, [TONIGHT_SHOW]);
    // Dashboard: the weekend window, bounded above with lte, one page (the
    // snapshot's "next up" reads ask for limit=1).
    if (url.includes('date=lte.') && /limit=\d{2,}/.test(url)) {
      return json(route, [FY_SHARED, DASH_SPONSORED, DASH_PLAIN_2, DASH_PLAIN]);
    }
    return route.fallback();
  });

  await page.route('**/rest/v1/restaurants?*', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes('rating=gte.4')) return json(route, RATED);
    return route.fallback();
  });
}

/**
 * Scroll down in steps until the page stops growing, so every LazySection
 * passes through the viewport and mounts. Waits for the rails first: checked
 * before the app has rendered, a short document reads as "already at the
 * bottom".
 */
async function scrollToBottom(page: Page) {
  await expect(page.locator('section[aria-labelledby="for-you-rail-heading"]')).toBeVisible({ timeout: 30_000 });
  let lastHeight = 0;
  let stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(200);
    const { atBottom, height } = await page.evaluate(() => ({
      atBottom: window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4,
      height: document.documentElement.scrollHeight,
    }));
    stable = atBottom && height === lastHeight ? stable + 1 : 0;
    lastHeight = height;
  }
}

test.describe('home rails honesty (pass-2 WP3)', () => {
  test('the anonymous rail reads events, filters unpublished rows and labels paid ones', async ({ page }) => {
    const rpcCalls: string[] = [];
    const forYouReads: string[] = [];
    page.on('request', (req) => {
      const url = decodeURIComponent(req.url());
      if (url.includes('/rest/v1/rpc/get_trending_events')) rpcCalls.push(url);
      if (url.includes('/rest/v1/events?') && url.includes('order=trending_score')) forYouReads.push(url);
    });
    await installHonestyBackend(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const rail = page.locator('section[aria-labelledby="for-you-rail-heading"]');
    await expect(rail.getByText('Paid Placement Gala')).toBeVisible({ timeout: 30_000 });

    expect(rpcCalls, 'get_trending_events was called for an anonymous visitor').toEqual([]);
    expect(forYouReads.length).toBeGreaterThan(0);
    for (const url of forYouReads) {
      expect(url).toContain('is_merged=neq.true');
      expect(url).toContain('is_hidden=neq.true');
      expect(url).toContain('archived_at=is.null');
    }

    await expect(page.getByText('Hidden Row Must Not Render')).toHaveCount(0);

    // No row carries a trending_score, so the rail does not claim "Trending".
    await expect(rail.getByRole('heading', { name: 'Coming up' })).toBeVisible();

    const paid = rail.locator('a', { hasText: 'Paid Placement Gala' });
    await expect(paid.getByText('Sponsored', { exact: true })).toBeVisible();
    // A card says when before what.
    await expect(paid).toContainText('Mon, Oct 5');
  });

  test('sponsored rows are labelled on the dashboard and capped in MostSearched', async ({ page }) => {
    await installHonestyBackend(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await scrollToBottom(page);

    const dashboard = page.locator('section[aria-labelledby="dashboard-heading"]');
    await expect(dashboard.getByRole('heading', { name: 'Explore Des Moines' })).toBeVisible({ timeout: 30_000 });
    await expect(dashboard.getByRole('heading', { name: 'This weekend', exact: true })).toBeVisible();
    const paidCard = dashboard.locator('article', { hasText: 'Sponsored Saturday Market' });
    await expect(paidCard.getByText('Sponsored', { exact: true })).toBeVisible();

    const most = page.locator('#most-searched');
    await expect(most.getByRole('heading', { name: 'Highly rated restaurants' })).toBeVisible({ timeout: 30_000 });
    await expect(most.getByText('Sponsored Steakhouse One')).toBeVisible();
    // The second sponsored row is past the one-per-column cap.
    await expect(most.getByText('Sponsored Steakhouse Two')).toHaveCount(0);
    await expect(most.getByText('Sponsored', { exact: true })).toHaveCount(1);
    await expect(most.getByText(/^Featured/)).toHaveCount(0);
  });

  test('a full scroll makes no admin-only reads and at most 8 below-the-fold place reads', async ({ page }) => {
    const seen: Request[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'OPTIONS' && req.url().includes('/rest/v1/')) seen.push(req);
    });
    await installHonestyBackend(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await scrollToBottom(page);
    await expect(page.locator('#most-searched')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const urls = seen.map((r) => decodeURIComponent(r.url()));
    expect(urls.filter((u) => u.includes('/rest/v1/trending_scores'))).toEqual([]);
    expect(urls.filter((u) => u.includes('/rest/v1/search_analytics'))).toEqual([]);

    // Dashboard and MostSearched: the place tables, plus the dashboard's
    // weekend events read. The Tonight rail's restaurant box query (ordered by
    // id) is first-view traffic and not counted.
    const belowFold = urls.filter(
      (u) =>
        (/\/rest\/v1\/(restaurants|attractions|playgrounds|hotels)\?/.test(u) && !u.includes('order=id.asc')) ||
        // The snapshot's single-row "next up" reads (limit=1) are not the dashboard's.
        (u.includes('/rest/v1/events?') && u.includes('date=lte.') && /limit=\d{2,}/.test(u)),
    );
    expect(belowFold.length, belowFold.join('\n')).toBeLessThanOrEqual(8);
  });

  test('no event detail link appears twice on the page', async ({ page }) => {
    await installHonestyBackend(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-tonight-link="event"]').first()).toBeVisible({ timeout: 30_000 });
    await scrollToBottom(page);
    await expect(page.locator('section[aria-labelledby="dashboard-heading"] [data-card-link]').first()).toBeVisible({
      timeout: 30_000,
    });

    const hrefs = await page
      .locator('a[href^="/events/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    // Detail pages end in a Central date; hub links like /events/today repeat by design.
    const detail = hrefs.filter((h) => /-\d{4}-\d{2}-\d{2}$/.test(h));
    const dupes = detail.filter((h, i) => detail.indexOf(h) !== i);
    expect(dupes, `repeated event links: ${dupes.join(', ')}`).toEqual([]);

    // The shared rows landed where they belong: the tonight show in Tonight,
    // the weekend row in For You, not again in the dashboard.
    const rail = page.locator('section[aria-labelledby="for-you-rail-heading"]');
    await expect(rail.getByText('Tonight Shared Show')).toHaveCount(0);
    await expect(rail.getByText('Rail And Dashboard Shared')).toBeVisible();
    const dashboard = page.locator('section[aria-labelledby="dashboard-heading"]');
    await expect(dashboard.getByText('Rail And Dashboard Shared')).toHaveCount(0);
  });
});
