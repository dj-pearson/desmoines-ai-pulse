import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';
import { centralDay } from './support/fixtureClock';

/**
 * Explore pass 2 WP4: /playgrounds/:slug.
 *
 *  1. Both ld+json blocks are escaped (toJsonLd): a name holding
 *     "</script><script>" stays inside its block and runs nothing, and the
 *     Playground node is @type Playground with @id #place, a locality read
 *     from the row, and no isAccessibleForFree.
 *  2. No "Free", "by families", "editors" or "All ages welcome", on the page
 *     or in the meta description.
 *  3. One facts block: Parent essentials plus one Address block with one
 *     Directions link and a plain line that hours aren't listed. A null age
 *     range renders nothing.
 *  4. "Happening here and nearby" lists an event within two miles.
 *  5. The nearby side query is bounded, explicit, and not rating-ordered
 *     (item 10), and the page renders no "Playground Not Found".
 *  6. A failed fetch is a Retry with no noindex (WEB-SEO-040); a missing row
 *     is "Playground Not Found" as the page's one h1, with noindex.
 *  7. playgrounds.rating is never shown, in the hero or on a side card; the
 *     hero shows the content_rating_aggregates review average or nothing, and
 *     no side query selects or orders by rating (WEB-SEO-056).
 *  8. The page mounts the review widget under #reviews for content_type
 *     playground, and the hero average links to it (WEB-SEO-058).
 *
 * The fixture backend does not filter; playgrounds and events are answered
 * here with page.route AFTER installFixtureBackend, which wins the match.
 */

const CORS = { 'access-control-allow-origin': '*' };

const BASE = {
  image_url: null,
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DOWNTOWN = {
  ...BASE,
  id: '31000000-0000-0000-0000-000000000001',
  name: 'Fixture Downtown Playground',
  slug: 'fixture-downtown-playground',
  location: '400 Locust St, Des Moines, IA 50309',
  latitude: 41.5868,
  longitude: -93.625,
  age_range: null,
  amenities: ['Swings'],
  has_shade: false,
  has_restrooms: true,
  surface_type: 'Rubber',
  accessibility_notes: 'Ramp to the main deck.',
  description: 'A playground supplied by tests/playground-detail.spec.ts.',
  is_featured: true,
  rating: 4.5,
};

const NEIGHBOUR = {
  ...BASE,
  id: '31000000-0000-0000-0000-000000000002',
  name: 'Fixture Neighbour Playground',
  location: '100 Court Ave, Des Moines, IA 50309',
  latitude: 41.585,
  longitude: -93.62,
  age_range: '2-5',
  amenities: [],
  has_shade: true,
  has_restrooms: null,
  surface_type: null,
  accessibility_notes: null,
  description: null,
  is_featured: false,
  rating: null,
};

const HOSTILE_NAME = 'Fixture </script><script>window.__pwned=1</script> Playground';

// A month out, from today. The rail keeps only upcoming events
// (isLinkableUpcomingEvent), so a literal date here empties it on the day after
// (WEB-QA-044; it was '2027-10-01').
const NEARBY_DAY = centralDay(30);

const NEARBY_EVENT = {
  id: '21000000-0000-0000-0000-000000000001',
  title: 'Fixture Story Time in the Park',
  description: 'An event supplied by tests/playground-detail.spec.ts.',
  category: 'Family',
  date: NEARBY_DAY,
  event_start_utc: `${NEARBY_DAY}T15:00:00Z`,
  start_time: '10:00:00',
  end_time: null,
  location: 'Des Moines',
  venue: 'Fixture Library Lawn',
  city: 'Des Moines',
  state: 'IA',
  address: '1000 Grand Ave',
  image_url: null,
  price: null,
  latitude: 41.587,
  longitude: -93.626,
  slug: 'fixture-story-time',
  is_featured: false,
  status: 'upcoming',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function fulfil(route: Route, rows: unknown[]) {
  const req = route.request();
  if (req.method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${rows.length}` }, body: '' });
  }
  if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      headers: CORS,
      body: JSON.stringify(rows[0] ?? null),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...CORS, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

/** The detail row for any slug/id lookup, NEIGHBOUR for the side lists. */
async function installPlayground(page: Page, detail: Record<string, unknown>): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/playgrounds**', (route) => {
    const url = decodeURIComponent(route.request().url().replace(/\+/g, '%20'));
    seen.push(url);
    if (/[?&](slug|id)=eq\./.test(url)) return fulfil(route, [detail]);
    return fulfil(route, [NEIGHBOUR]);
  });
  await page.route('**/rest/v1/events**', (route) => fulfil(route, [NEARBY_EVENT]));
  return seen;
}

/** A whole content_rating_aggregates row: RatingSystem reads every column. */
function aggregateRow(average: number, total: number) {
  return {
    id: '33000000-0000-0000-0000-000000000002',
    content_type: 'playground',
    content_id: DOWNTOWN.id,
    average_rating: average,
    weighted_average: average,
    total_ratings: total,
    rating_distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 },
    last_updated: '2026-01-01T00:00:00Z',
  };
}

/** The page's own text, without the site header and footer. */
async function pageBodyText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = (document.querySelector('main') ?? document.body).cloneNode(true) as HTMLElement;
    root.querySelectorAll('header, footer, script, style').forEach((el) => el.remove());
    return root.innerText;
  });
}

test.describe('/playgrounds/:slug (explore pass 2 WP4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('ld+json is escaped and describes a Playground from its own row', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, { ...DOWNTOWN, name: HOSTILE_NAME });
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('window.__pwned');

    // The injected script never ran.
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

    await expect
      .poll(async () =>
        page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
          els.map((e) => e.textContent ?? '').filter((t) => t.includes('"Playground"')).length,
        ),
      )
      .toBeGreaterThan(0);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    for (const raw of blocks) {
      expect(raw).not.toMatch(/<\/script/i);
      expect(() => JSON.parse(raw)).not.toThrow();
    }
    const nodes = blocks.map((b) => JSON.parse(b) as Record<string, unknown>);
    const place = nodes.find((n) => n['@type'] === 'Playground');
    expect(place).toBeTruthy();
    expect(place!.name).toBe(HOSTILE_NAME);
    expect(String(place!['@id'])).toMatch(/\/playgrounds\/[^#]+#place$/);
    expect(place).not.toHaveProperty('isAccessibleForFree');
    expect(place).not.toHaveProperty('publicAccess');
    expect((place!.address as Record<string, unknown>).addressLocality).toBe('Des Moines');

    const speakable = nodes.find((n) => n['@type'] === 'WebPage' && 'speakable' in n);
    expect((speakable!.speakable as Record<string, unknown>).cssSelector).toEqual(['h1']);

    // geo.position comes from the row, not a downtown fallback.
    await expect(page.locator('meta[name="geo.position"]')).toHaveAttribute('content', '41.5868;-93.625');
  });

  test('no Free, "by families", editors or "All ages welcome"', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();

    // Featured is the column, shown as that word and nothing more.
    await expect(page.getByText('Featured', { exact: true })).toBeVisible();

    const text = await pageBodyText(page);
    expect(text).not.toMatch(/\bFree\b/);
    expect(text).not.toMatch(/by families/i);
    expect(text).not.toMatch(/editor/i);
    expect(text).not.toMatch(/All ages welcome/i);

    const description = (await page.locator('meta[name="description"]').last().getAttribute('content')) ?? '';
    expect(description).not.toMatch(/by families/i);
    expect(description).not.toMatch(/\bfree\b/i);
    await expect(page.locator('.playground-summary')).toHaveCount(0);
  });

  test('one facts block, one Directions link, no ages row when age_range is null', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');

    const essentials = page.locator('section[data-playground-essentials]');
    await expect(essentials).toContainText('Rubber');
    await expect(essentials).toContainText('Ramp to the main deck.');
    await expect(essentials.locator('dt', { hasText: 'Ages' })).toHaveCount(0);
    await expect(essentials.locator('dt', { hasText: 'Admission' })).toHaveCount(0);

    const address = page.locator('[data-playground-address]');
    await expect(address).toContainText('400 Locust St, Des Moines, IA 50309');
    await expect(address).toContainText("Hours aren't listed");
    await expect(page.getByRole('heading', { name: 'Things To Know' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Playground Details' })).toHaveCount(0);

    // At desktop width the sticky mobile bar is hidden: one visible Directions link.
    await expect(page.getByRole('link', { name: /Directions/ }).filter({ visible: true })).toHaveCount(1);
  });

  test('events within two miles under "Happening here and nearby"', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    const rail = page.locator('section[aria-labelledby="attraction-events-heading"]');
    await expect(rail).toBeVisible();
    await expect(rail).toContainText('Fixture Story Time in the Park');
  });

  test('nearby side query is bounded, explicit and not rating-ordered', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();

    await expect.poll(() => seen.some((u) => u.includes('longitude=gte.'))).toBe(true);
    const nearby = seen.find((u) => u.includes('longitude=gte.')) ?? '';
    expect(nearby).not.toContain('order=rating');
    expect(nearby).not.toContain('select=*');

    await expect(page.locator('[data-playground-side-card]').first()).toBeVisible();
    await expect(page.getByText('Playground Not Found')).toHaveCount(0);
    await expect(page.getByText(/dawn to dusk/i)).toHaveCount(0);
  });

  test('no unsourced rating: the hero shows the review average or nothing', async ({ page }) => {
    await installFixtureBackend(page);
    // DOWNTOWN carries rating 4.5; the side card gets 3.9.
    await page.route('**/rest/v1/playgrounds**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (/[?&](slug|id)=eq\./.test(url)) return fulfil(route, [DOWNTOWN]);
      return fulfil(route, [{ ...NEIGHBOUR, rating: 3.9 }]);
    });
    const seen: string[] = [];
    await page.route('**/rest/v1/playgrounds**', (route) => {
      seen.push(decodeURIComponent(route.request().url()));
      return route.fallback();
    });
    await page.route('**/rest/v1/events**', (route) => fulfil(route, [NEARBY_EVENT]));
    await page.route('**/rest/v1/content_rating_aggregates**', (route) => fulfil(route, []));

    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();
    await expect(page.locator('[data-playground-side-card]').first()).toBeVisible();

    const text = await pageBodyText(page);
    expect(text).not.toContain('4.5');
    expect(text).not.toContain('3.9');
    await expect(page.locator('[data-review-summary]')).toHaveCount(0);

    const side = seen.filter((u) => !/[?&](slug|id)=eq\./.test(u) && u.includes('select='));
    expect(side.length).toBeGreaterThan(0);
    for (const u of side) {
      expect(u).not.toMatch(/order=rating/);
      expect(u).not.toMatch(/select=[^&]*\brating\b/);
    }
  });

  test('a first-party review average shows with its count', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.route('**/rest/v1/content_rating_aggregates**', (route) => {
      const url = decodeURIComponent(route.request().url());
      expect(url).toContain('content_type=eq.playground');
      return fulfil(route, [aggregateRow(4.2, 3)]);
    });

    await page.goto('/playgrounds/fixture-downtown-playground');
    const summary = page.locator('[data-review-summary]');
    await expect(summary).toHaveText('4.2 from 3 reviews');
    await expect(summary).toHaveAttribute('href', '#reviews');
    await expect(page.getByText('4.5')).toHaveCount(0);
  });

  test('the review widget mounts under #reviews for this playground', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.route('**/rest/v1/content_rating_aggregates**', (route) =>
      fulfil(route, [aggregateRow(4.2, 3)]),
    );
    const ratingQueries: string[] = [];
    await page.route('**/rest/v1/user_ratings**', (route) => {
      ratingQueries.push(decodeURIComponent(route.request().url()));
      return fulfil(route, []);
    });

    await page.goto('/playgrounds/fixture-downtown-playground');
    const summary = page.locator('[data-review-summary]');
    await expect(summary).toHaveText('4.2 from 3 reviews');

    // The link resolves: exactly one #reviews target, and following it
    // brings the deferred widget into view, which mounts it.
    await expect(page.locator('#reviews')).toHaveCount(1);
    await summary.click();
    await expect(page).toHaveURL(/#reviews$/);
    const widget = page.locator('#reviews');
    await expect(widget.getByText('User Ratings')).toBeVisible();
    await expect(widget.getByText('Based on 3 reviews')).toBeVisible();

    expect(ratingQueries.length).toBeGreaterThan(0);
    for (const u of ratingQueries) {
      expect(u).toContain('content_type=eq.playground');
      expect(u).toContain(`content_id=eq.${DOWNTOWN.id}`);
    }
  });

  test('a failed fetch offers Retry and sets no noindex', async ({ page }) => {
    // A 500 with no PostgREST code is retried twice by shouldRetry, so the
    // error state arrives after about three seconds of backoff.
    let failing = true;
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.route('**/rest/v1/playgrounds**', (route) => {
      if (!failing) return route.fallback();
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: CORS,
        body: JSON.stringify({ message: 'fixture: upstream failure' }),
      });
    });

    await page.goto('/playgrounds/fixture-downtown-playground');
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Playground Not Found')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);

    failing = false;
    await retry.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('a missing row is "Playground Not Found" as the one h1, with noindex', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/playgrounds**', (route) => fulfil(route, []));
    await page.goto('/playgrounds/no-such-playground');

    await expect(page.getByRole('heading', { level: 1, name: 'Playground Not Found' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  });
});
