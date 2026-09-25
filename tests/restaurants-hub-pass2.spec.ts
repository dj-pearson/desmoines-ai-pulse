import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The /restaurants hub, second pass (docs/page-plans/eat-drink-pass2.md WP1).
 *
 * RUNS AGAINST FIXTURES. installFixtureBackend answers everything; each test
 * adds its own page.route handlers AFTER it, because Playwright gives the most
 * recently registered handler the match (fixtureBackend.ts). A handler that
 * is not interested calls route.fallback(), which hands the request to the
 * fixture backend underneath.
 *
 * Test hooks are roles, hrefs and data-* attributes, never data-testid:
 * vite.config.ts strips data-testid from every build.
 */

const TOTAL = 478;

async function seedConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
}

function json(route: Route, body: unknown, total = Array.isArray(body) ? body.length : 1) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': total > 0 ? `0-${total - 1}/${total}` : '*/0',
  };
  // A count-only read is a HEAD request and must not get a body
  // (fixtureBackend.ts explains what that breaks).
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

/** Every column the list projection asks for; a missing one is a crash, not a blank. */
function restaurant(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: 'A restaurant supplied by restaurants-hub-pass2.spec.ts.',
    cuisine: 'American',
    price_range: '$$',
    address: '100 Court Ave',
    city: 'Des Moines',
    state: 'IA',
    image_url: null,
    rating: 4.5,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    is_featured: false,
    latitude: 41.58,
    longitude: -93.62,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    data_quality_score: 80,
    enhanced: false,
    google_place_id: null,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    location: '100 Court Ave, Des Moines, IA 50309',
    merged_at: null,
    merged_into: null,
    opening: null,
    opening_date: null,
    opening_timeframe: null,
    phone: null,
    popularity_score: 50,
    source_url: null,
    status: 'open',
    website: null,
    writeup_generated_at: null,
    ...extra,
  };
}

function isTable(url: string, table: string): boolean {
  return new URL(url).pathname.endsWith(`/rest/v1/${table}`);
}

test.describe('Hub pass 2: no false empty state (item 1)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('with sponsors answering at once and the list 2s late, "No restaurants" never shows', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    const sponsors = [
      restaurant('90000000-0000-0000-0000-000000000001', 'Paid One', { is_sponsored: true }),
      restaurant('90000000-0000-0000-0000-000000000002', 'Paid Two', { is_sponsored: true }),
    ];
    await page.route('**/rest/v1/restaurants?**', (route) => {
      if (route.request().url().includes('is_sponsored=eq.true')) return json(route, sponsors);
      return route.fallback();
    });
    await page.route('**/rest/v1/rpc/get_rotated_restaurants', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return route.fallback();
    });

    await page.goto('/restaurants');
    const noRestaurants = page.getByText(/no restaurants/i);
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      expect(await noRestaurants.count()).toBe(0);
      await page.waitForTimeout(100);
    }
    await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);
    await expect(noRestaurants).toHaveCount(0);
  });
});

test.describe('Hub pass 2: phone first screen (item 3)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('with a tonight pairing, the first card clears the bottom nav and the strip sits after card 3', async ({ page }) => {
    // 3 PM Thursday in Des Moines. The show starts at 7 PM; dinner is 5:30.
    await page.clock.setFixedTime(new Date('2026-10-01T20:00:00Z'));
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });

    const show = {
      id: '70000000-0000-0000-0000-000000000001',
      title: 'Pass Two Fixture Show',
      date: '2026-10-02T00:00:00Z',
      event_start_utc: '2026-10-02T00:00:00Z',
      event_start_local: '2026-10-01T19:00:00',
      end_date: null,
      venue: 'Fixture Hall',
      location: 'Des Moines',
      city: 'Des Moines',
      category: 'Music',
      price: '$20',
      latitude: 41.58,
      longitude: -93.62,
      is_sponsored: false,
      sponsored_until: null,
      is_featured: false,
      image_url: null,
      description: 'Fixture',
      start_time: '19:00:00',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    await page.route('**/rest/v1/events?**', (route) => json(route, [show]));
    await page.route('**/rest/v1/restaurants?**', (route) => {
      const url = route.request().url();
      // The tonight query is the one that needs hours.
      if (url.includes('opening=not.is.null')) {
        return json(route, [
          {
            id: '80000000-0000-0000-0000-000000000001',
            name: 'Fixture Supper Club',
            slug: 'fixture-supper-club',
            cuisine: 'American',
            latitude: 41.5801,
            longitude: -93.6201,
            opening: 'Mon-Sun 11:00 AM - 11:00 PM',
            opening_date: null,
            status: 'open',
          },
        ]);
      }
      return route.fallback();
    });

    await page.goto('/restaurants');
    await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);
    await expect(page.locator('[data-tonight-row]').first()).toBeVisible();

    const firstTitle = page.locator('article h3 a').first();
    const box = await firstTitle.boundingBox();
    expect(box, 'first card title has a box').not.toBeNull();
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    const navBox = (await bottomNav.count()) > 0 ? await bottomNav.first().boundingBox() : null;
    expect(box!.y + box!.height).toBeLessThanOrEqual(navBox ? navBox.y : 844);

    // Document order: card 3, then the strip, then card 4.
    const order = await page.evaluate(() => {
      const strip = document.getElementById('restaurants-tonight-heading')?.closest('section');
      const cards = Array.from(document.querySelectorAll('#all-restaurants-heading ~ * article, #all-restaurants-heading ~ article'));
      if (!strip || cards.length < 4) return null;
      const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { afterThird: follows(cards[2], strip), beforeFourth: follows(strip, cards[3]) };
    });
    expect(order).toEqual({ afterThird: true, beforeFourth: true });
  });

  test('the h1 keeps "Des Moines" on one line at 390px', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    await page.goto('/restaurants');
    const city = page.locator('h1 span', { hasText: 'Des Moines' });
    const lines = await city.evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  });
});

test.describe('Hub pass 2: Load More fetches the next thirty (item 7)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the second request asks for offset 30, limit 30, and Back is not a Load More', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    const bodies: Array<Record<string, unknown>> = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/rpc/get_rotated_restaurants')) {
        try {
          bodies.push((req.postDataJSON() as Record<string, unknown>) ?? {});
        } catch {
          // Not JSON; ignored.
        }
      }
    });

    await page.goto('/restaurants');
    await expect(page.locator('article h3 a')).toHaveCount(30);
    const historyBefore = await page.evaluate(() => window.history.length);

    await page.getByRole('button', { name: /load more/i }).click();
    await expect(page.locator('article h3 a')).toHaveCount(60);
    await expect(page.locator('[data-results-count]')).toContainText(`Showing 60 of ${TOTAL}`);

    const windows = bodies.map((b) => [b.offset_count, b.limit_count]);
    expect(windows[0]).toEqual([0, 30]);
    expect(windows).toContainEqual([30, 30]);
    // Nothing asked for rows 1-60 again.
    expect(windows).not.toContainEqual([0, 60]);

    await expect(page).toHaveURL(/[?&]page=2/);
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);
  });

  test('a cold ?page=5 loads two pages and offers earlier results', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    const bodies: Array<Record<string, unknown>> = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/rpc/get_rotated_restaurants')) {
        bodies.push((req.postDataJSON() as Record<string, unknown>) ?? {});
      }
    });
    await page.goto('/restaurants?page=5');
    await expect(page.locator('[data-results-count]')).toContainText(`Showing 91-150 of ${TOTAL}`);
    expect(bodies.map((b) => [b.offset_count, b.limit_count])[0]).toEqual([90, 60]);
    await expect(page.getByRole('button', { name: /load earlier results/i })).toBeVisible();
  });
});

test.describe('Hub pass 2: search (items 5 and 6)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('?q=harb&sort=rating finds Harbinger with a prefix query', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page);
    const searches: string[] = [];
    await page.route('**/rest/v1/restaurants?**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.includes('search_vector=')) {
        searches.push(url);
        return json(route, [restaurant('60000000-0000-0000-0000-000000000001', 'Harbinger')]);
      }
      return route.fallback();
    });

    await page.goto('/restaurants?q=harb&sort=rating');
    await expect(page.locator('article h3 a', { hasText: 'Harbinger' })).toBeVisible();
    expect(searches.some((u) => u.includes('search_vector=fts(english).harb:*'))).toBe(true);
  });

  test('a zero-hit filtered search shows only did-you-mean links with slugs', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/restaurants?**', (route) => {
      const url = route.request().url();
      if (!isTable(url, 'restaurants')) return route.fallback();
      const select = new URL(url).searchParams.get('select');
      if (select === 'id,slug,name') {
        // The merged row is not in the lookup, so it must not be suggested.
        return json(route, [{ id: 'fz-1', slug: 'taco-place', name: 'Taco Place' }]);
      }
      if (url.includes('search_vector=')) return json(route, [], 0);
      return route.fallback();
    });
    await page.route('**/rest/v1/rpc/fuzzy_search_restaurants', (route) =>
      json(route, [
        { id: 'fz-1', name: 'Taco Place' },
        { id: 'fz-merged', name: 'Old Taco Place' },
      ]),
    );

    await page.goto('/restaurants?q=tacos&cuisine=Thai&sort=rating');
    await expect(page.getByText(/no results for "tacos"/i)).toBeVisible();
    const links = page.locator('[data-did-you-mean] a');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute('href', '/restaurants/taco-place');
    await expect(page.locator('article h3 a')).toHaveCount(0);
  });
});

test.describe('Hub pass 2: honest labels (items 2 and 9)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('no Featured pill, and an old ?featured=1 link shows a "Sponsored only" chip', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    await page.goto('/restaurants');
    await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);
    await expect(page.getByRole('button', { name: /^featured$/i })).toHaveCount(0);

    await page.goto('/restaurants?featured=1');
    await expect(page.getByText('Sponsored only')).toBeVisible();
  });

  test('the price filter names levels, not dollar bands', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    await page.goto('/restaurants');
    await page.getByRole('button', { name: /^price/i }).click();
    await expect(page.getByRole('button', { name: /\$\s*inexpensive/i })).toBeVisible();
    await expect(page.getByText(/under \$15/i)).toHaveCount(0);
  });
});
