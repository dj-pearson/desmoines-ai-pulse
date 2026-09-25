import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore pass 2 WP5: the detail pages one click under /sports, /music and
 * /outdoors.
 *
 *  1. Item 7: loading is not empty. While the events request for
 *     /sports/iowa-cubs or /music/venues/woolys is in flight, neither page
 *     says "No upcoming"; once it answers with no rows, it does.
 *  2. Item 14: the team's games query carries a sports-category guard and the
 *     team's aliases (I-Cubs), and buttons are not nested inside links.
 *  3. Item 11: admin-written URLs that are not http(s) never become links, and
 *     the team JSON-LD is escaped.
 *  4. Item 8: a trail that is an /outdoors guide destination carries the
 *     guide's logistics, a "Written" date, directions and TouristAttraction
 *     JSON-LD with geo and an address.
 *
 * The fixture backend does not filter; each table this spec is about is
 * answered with page.route AFTER installFixtureBackend, which wins the match.
 */

const ISO = '2026-09-01T00:00:00Z';
const NOW = new Date('2026-09-24T17:00:00Z'); // Thu 12:00 CDT
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };

function answer(route: Route, rows: unknown[]) {
  const headers = { ...CORS, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  if ((route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object')) {
    return rows.length > 0
      ? route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows[0]) })
      : route.fulfill({
          status: 406,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
        });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

function eventRow(i: number, title: string, startUtc: string, venue: string) {
  return {
    id: `62000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    category: 'Sports',
    city: 'Des Moines',
    created_at: ISO,
    date: startUtc,
    end_date: null,
    enhanced_description: null,
    event_start_local: null,
    event_start_utc: startUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58,
    location: 'Des Moines',
    longitude: -93.62,
    original_description: 'A fixture event for the detail pages.',
    price: null,
    source_url: 'https://example.com/fixture',
    updated_at: ISO,
    venue,
    writeup_generated_at: null,
  };
}

const CUBS = {
  id: '71000000-0000-0000-0000-000000000001',
  name: 'Iowa Cubs',
  slug: 'iowa-cubs',
  sport: 'Baseball',
  league: 'Triple-A (MiLB)',
  venue_name: 'Principal Park',
  venue_id: null,
  logo_url: null,
  website: 'https://www.milb.com/iowa',
  schedule_url: 'javascript:alert(1)',
  description: 'Fixture team </script><script>window.__pwned = 1</script>',
  created_at: ISO,
};

const WOOLYS = {
  id: '70000000-0000-0000-0000-000000000002',
  name: 'Woolys',
  slug: 'woolys',
  description: 'A fixture venue.',
  address: '504 E Locust St, Des Moines, IA 50309',
  capacity: 700,
  venue_type: 'club',
  image_url: null,
  website: 'javascript:alert(1)',
  latitude: 41.5892,
  longitude: -93.6098,
  created_at: ISO,
};

const HIGH_TRESTLE = {
  id: '61000000-0000-0000-0000-000000000009',
  name: 'High Trestle Trail',
  slug: 'high-trestle-trail',
  description: 'A rail trail with the lit bridge.',
  length_miles: 25,
  difficulty: 'easy',
  surface_type: 'paved',
  activities: ['biking', 'walking'],
  highlights: null,
  trailhead_address: null,
  latitude: 41.8,
  longitude: -93.9,
  image_url: null,
  website: 'javascript:alert(1)',
  is_featured: false,
  created_at: ISO,
};

const GAMES = [eventRow(1, 'I-Cubs vs Fixture Sox', '2026-09-26T00:05:00Z', 'Principal Park')];
const SHOWS = [eventRow(2, 'Woolys Late Show', '2026-09-26T01:00:00Z', "Wooly's")];

/** Answer events after `delayMs`, and record each request URL. */
async function routeEvents(page: Page, rows: unknown[], delayMs = 0): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/events?**', async (route) => {
    seen.push(decodeURIComponent(route.request().url()));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return answer(route, rows);
  });
  return seen;
}

/** Poll the page for `ms` and fail if it ever says "No upcoming". */
async function neverSaysNoUpcoming(page: Page, ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const text = await page.locator('#root').innerText();
    expect(text, 'said "No upcoming" while the events request was pending').not.toContain('No upcoming');
    await page.waitForTimeout(400);
  }
}

test.describe('/sports/iowa-cubs', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/teams?**', (route) => answer(route, [CUBS]));
  });

  test('never shows "No upcoming games" while its events request is pending', async ({ page }) => {
    const requests = await routeEvents(page, GAMES, 5_000);
    await page.goto('/sports/iowa-cubs');
    await expect(page.getByRole('heading', { level: 1, name: 'Iowa Cubs' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-team-games-loading]')).toBeVisible();

    await neverSaysNoUpcoming(page, 3_500);

    await expect(page.getByRole('link', { name: /I-Cubs vs Fixture Sox/ })).toBeVisible({ timeout: 15_000 });
    // Item 14: a sports-category guard and the I-Cubs alias, in one request.
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('category.eq.Sports');
    expect(requests[0]).toContain('title.ilike.%I-Cubs%');
  });

  test('says "No upcoming games" once the request answers with none', async ({ page }) => {
    await routeEvents(page, []);
    await page.goto('/sports/iowa-cubs');
    await expect(page.getByText('No upcoming games listed for Iowa Cubs.')).toBeVisible({ timeout: 30_000 });
  });

  test('safe links, escaped JSON-LD, no button inside a link, a labelled breadcrumb', async ({ page }) => {
    await routeEvents(page, GAMES);
    await page.goto('/sports/iowa-cubs');
    await expect(page.getByRole('link', { name: /I-Cubs vs Fixture Sox/ })).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Official website/ })).toHaveAttribute('href', 'https://www.milb.com/iowa');
    await expect(page.locator('a button, button a')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();

    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const team = blocks.map((b) => JSON.parse(b)).find((node) => node['@type'] === 'SportsTeam');
    expect(team?.name).toBe('Iowa Cubs');
    expect(blocks.join('\n')).not.toContain('</script>');
  });
});

test.describe('/music/venues/woolys', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/venues?**', (route) => answer(route, [WOOLYS]));
  });

  test('never shows "No upcoming events" while its events request is pending', async ({ page }) => {
    await routeEvents(page, SHOWS, 5_000);
    await page.goto('/music/venues/woolys');
    await expect(page.getByRole('heading', { level: 1, name: 'Woolys' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-venue-events-loading]')).toBeVisible();

    await neverSaysNoUpcoming(page, 3_500);

    // "Wooly's" on the event row matches the Woolys venue (item 1).
    await expect(page.getByRole('link', { name: /Woolys Late Show/ })).toBeVisible({ timeout: 15_000 });
  });

  test('says "No upcoming events" once the request answers with none, and links nothing unsafe', async ({ page }) => {
    await routeEvents(page, []);
    await page.goto('/music/venues/woolys');
    await expect(page.getByText('No upcoming events listed for this venue.')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a button, button a')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  });
});

test.describe('/music/venues/wells-fargo-arena', () => {
  // The venues row can still carry the arena's old name. The plan's acceptance
  // line is that no page says "Wells Fargo Arena"; the venue page shows the
  // current name while matching keeps the row name for its aliases.
  test('shows the arena under its current name', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/venues?**', (route) =>
      answer(route, [{ ...WOOLYS, id: '70000000-0000-0000-0000-000000000003', name: 'Wells Fargo Arena', slug: 'wells-fargo-arena', website: null, venue_type: 'arena' }]),
    );
    await routeEvents(page, []);
    await page.goto('/music/venues/wells-fargo-arena');
    await expect(page.getByRole('heading', { level: 1, name: "Casey's Center" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main, body').first()).not.toContainText('Wells Fargo Arena');
    await expect(page).not.toHaveTitle(/Wells Fargo Arena/);
  });
});

test.describe('/outdoors/high-trestle-trail', () => {
  test('carries the guide logistics, a Written date, directions and TouristAttraction JSON-LD', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/trails**', (route) => answer(route, [HIGH_TRESTLE]));
    await page.goto('/outdoors/high-trestle-trail');

    await expect(page.getByRole('heading', { level: 1, name: 'High Trestle Trail' })).toBeVisible({ timeout: 30_000 });
    const guide = page.locator('section[aria-labelledby="trail-before-you-go"]');
    await expect(guide).toBeVisible();
    for (const term of ['From downtown', 'Parking', 'Where to start', 'Dogs', 'In winter', 'Cost']) {
      await expect(guide.locator('dt', { hasText: term })).toHaveCount(1);
    }
    await expect(guide.locator('[data-logistics-date]')).toHaveText(/^Written /);
    await expect(page.locator('#root')).not.toContainText('Details checked');

    await expect(page.getByRole('link', { name: /Get directions/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=41.8,-93.9',
    );
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a button, button a')).toHaveCount(0);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const place = blocks.map((b) => JSON.parse(b)).find((node) => node['@type'] === 'TouristAttraction');
    expect(place, 'no TouristAttraction JSON-LD').toBeTruthy();
    expect(place.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 41.8, longitude: -93.9 });
    expect(place.address?.['@type']).toBe('PostalAddress');
    expect(place.address?.addressRegion).toBe('IA');
  });

  test('a trail that is not a guide destination has no guide block', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/trails**', (route) =>
      answer(route, [{ ...HIGH_TRESTLE, name: 'Fixture Loop', slug: 'fixture-loop', website: 'https://example.com/loop' }]),
    );
    await page.goto('/outdoors/fixture-loop');

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Loop' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('section[aria-labelledby="trail-before-you-go"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /More info/ })).toHaveAttribute('href', 'https://example.com/loop');
  });
});
