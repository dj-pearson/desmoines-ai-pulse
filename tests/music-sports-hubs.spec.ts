import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP5: /music and /sports.
 *
 * The clock is pinned to Thursday 2026-09-24 at 12:00 CDT. The events table is
 * answered with rows spread over tonight, this weekend and next week, and the
 * same rows serve both hubs: the fixture does not filter by category on
 * purpose (see fixtureBackend.ts), and what is asserted here is the request
 * shape and what the page does with the rows, not which categories match.
 *
 * Asserted, per the acceptance line:
 *   - every events request carries the visibility predicates (is_merged,
 *     is_hidden, archived_at), and each hub makes exactly one;
 *   - no event link renders twice;
 *   - during a 5s delayed response there is no empty phrase and no "0" badge;
 *   - with the backend cut, each hub shows exactly one events alert.
 *
 * The weekend rule (Saturday and Sunday resolve to the preceding Friday) is
 * unit-tested on a fixed clock in src/lib/__tests__/hubEventPartition.test.ts.
 *
 * Pass 2 (docs/page-plans/explore-pass2.md WP5), added below:
 *   - one venue matcher: the /music card count for Woolys equals the list on
 *     /music/venues/woolys, and a "Casey's Center" event gives the arena card
 *     a "Next:" line;
 *   - no page says "Wells Fargo Arena", "tailgating" or a seat capacity;
 *   - Sunday 20:00 Central renders no weekend section, Saturday titles it
 *     "Tomorrow (Sunday)";
 *   - "See all" links carry no count the destination can't reproduce.
 */

const NOW = new Date('2026-09-24T17:00:00Z'); // Thu 12:00 CDT
const ISO = '2026-09-01T00:00:00Z';

function row(i: number, title: string, startUtc: string, venue: string, category: string) {
  return {
    id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    category,
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
    original_description: 'A fixture event for the music and sports hubs.',
    price: '$20',
    source_url: 'https://example.com/fixture',
    updated_at: ISO,
    venue,
    writeup_generated_at: null,
  };
}

const EVENTS = [
  row(0, 'Tonight Jazz Trio', '2026-09-25T00:00:00Z', 'Fixture Hall', 'Music'), // Thu 19:00
  row(1, 'Friday Rock Show', '2026-09-26T01:00:00Z', 'Fixture Hall', 'Music'), // Fri 20:00
  row(2, 'Saturday Ballgame', '2026-09-26T23:00:00Z', 'Fixture Park', 'Sports'), // Sat 18:00
  row(3, 'Tuesday Folk Night', '2026-09-30T00:00:00Z', 'Other Room', 'Music'), // Tue 19:00
];

const VENUES = [
  {
    id: '70000000-0000-0000-0000-000000000001',
    name: 'Fixture Hall',
    slug: 'fixture-hall',
    description: 'A fixture venue.',
    address: '1 Locust St',
    capacity: 1200,
    venue_type: 'theater',
    image_url: null,
    website: null,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
  },
];

const EMPTY_PHRASES = [
  'Nothing listed for tonight',
  'No weekend shows listed yet',
  'No shows listed for Sunday yet',
  'No upcoming concerts found',
  'No games listed for today',
  'No games listed for the next 7 days',
];

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  // .single() asks for the object profile; answer one row, or PGRST116.
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
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(rows),
  });
}

/** Answer events from EVENTS (optionally after a delay) and record each request URL. */
async function routeEvents(page: Page, delayMs = 0, rows: unknown[] = EVENTS): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/events?**', async (route) => {
    seen.push(route.request().url());
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return json(route, rows);
  });
  return seen;
}

for (const hub of ['/music', '/sports'] as const) {
  test.describe(`${hub} hub`, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await installFixtureBackend(page);
      await page.route('**/rest/v1/venues?**', (route) => json(route, VENUES));
      await page.route('**/rest/v1/teams?**', (route) => json(route, []));
    });

    test('one visible-only events request, and no event rendered twice', async ({ page }) => {
      const requests = await routeEvents(page);
      await page.goto(hub);

      await expect(page.locator('a[href^="/events/"]').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');

      expect(requests, `${hub} made ${requests.length} events requests`).toHaveLength(1);
      for (const url of requests) {
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('is_merged=neq.true');
        expect(decoded).toContain('is_hidden=neq.true');
        expect(decoded).toContain('archived_at=is.null');
      }

      // Event cards only (a link wrapping a card title), not nav or See-all links.
      const hrefs = await page
        .locator('section a[href^="/events/"]:has(h3)')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
      expect(hrefs.length).toBeGreaterThan(0);
      expect(new Set(hrefs).size, `duplicate event links: ${hrefs.join(', ')}`).toBe(hrefs.length);
    });

    test('loading is not empty: no empty phrase and no 0 badge while events are in flight', async ({ page }) => {
      await routeEvents(page, 5_000);
      await page.goto(hub);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline) {
        const text = await page.locator('#root').innerText();
        for (const phrase of EMPTY_PHRASES) {
          expect(text, `${hub} said "${phrase}" while still loading`).not.toContain(phrase);
        }
        const zeroBadges = await page.locator('section h2 ~ div', { hasText: /^0$/ }).count();
        expect(zeroBadges, `${hub} showed a 0 count while still loading`).toBe(0);
        await page.waitForTimeout(500);
      }

      // And once the rows land, the page shows them.
      await expect(page.locator('a[href^="/events/"]').first()).toBeVisible({ timeout: 15_000 });
    });

    test('backend cut: exactly one events alert', async ({ page }) => {
      await page.route('**/rest/v1/**', (route) => route.abort('failed'));
      await page.goto(hub);

      const eventsAlert = page.locator('[data-hub-alert="events"]');
      await expect(eventsAlert.getByRole('alert')).toBeVisible({ timeout: 45_000 });
      await expect(eventsAlert).toHaveCount(1);
      await expect(eventsAlert.getByRole('alert')).toHaveCount(1);

      const text = await page.locator('#root').innerText();
      for (const phrase of EMPTY_PHRASES) {
        expect(text).not.toContain(phrase);
      }
    });
  });
}

test('/music venue cards say what is playing next', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/venues?**', (route) => json(route, VENUES));
  await routeEvents(page);

  await page.goto('/music');
  const card = page.locator('a[href="/music/venues/fixture-hall"]');
  await expect(card).toContainText('Next: Tonight Jazz Trio', { timeout: 30_000 });
  await expect(card).toContainText('2 shows in the next 2 weeks');
});

// ---------------------------------------------------------------------------
// Pass 2
// ---------------------------------------------------------------------------

function venueRow(i: number, name: string, slug: string, capacity: number | null = null) {
  return { ...VENUES[0], id: `70000000-0000-0000-0000-00000000000${i}`, name, slug, capacity };
}

const WOOLYS = venueRow(2, 'Woolys', 'woolys', 700);
const ARENA = venueRow(3, 'Wells Fargo Arena', 'wells-fargo-arena', 16980);

// All inside the next two weeks from NOW, so the hub window and the venue
// page see the same rows. Three spellings of one room, and one decoy.
const PASS2_EVENTS = [
  row(10, 'Woolys Show One', '2026-09-25T01:00:00Z', "Wooly's", 'Music'), // Thu 20:00
  row(11, 'Woolys Show Two', '2026-09-27T01:00:00Z', 'Woolys', 'Music'), // Sat 20:00
  row(12, 'Woolys Show Three', '2026-10-01T01:00:00Z', 'Wooly\u2019s Des Moines', 'Music'), // Wed 20:00
  row(13, 'Arena Concert', '2026-09-26T00:30:00Z', "Casey's Center", 'Music'), // Fri 19:30
  row(14, 'Liftoff Night', '2026-09-26T02:00:00Z', 'Liftoff Bar', 'Music'),
];

const TEAMS = [
  {
    id: '71000000-0000-0000-0000-000000000001',
    name: 'Iowa Cubs',
    slug: 'iowa-cubs',
    sport: 'Baseball',
    league: 'Triple-A (MiLB)',
    venue_name: 'Principal Park',
    venue_id: null,
    logo_url: null,
    website: 'https://www.milb.com/iowa',
    schedule_url: null,
    description: null,
    created_at: ISO,
  },
  {
    id: '71000000-0000-0000-0000-000000000002',
    name: 'Iowa Wild',
    slug: 'iowa-wild',
    sport: 'Hockey',
    league: 'AHL',
    venue_name: 'Wells Fargo Arena',
    venue_id: null,
    logo_url: null,
    website: 'javascript:alert(1)',
    schedule_url: null,
    description: null,
    created_at: ISO,
  },
];

test.describe('pass 2: one venue matcher', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/venues?**', (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.includes('slug=eq.woolys')) return json(route, [WOOLYS]);
      if (url.includes('slug=eq.wells-fargo-arena')) return json(route, [ARENA]);
      return json(route, [ARENA, WOOLYS]);
    });
    await routeEvents(page, 0, PASS2_EVENTS);
  });

  test("the /music card count for Woolys equals the list on its venue page", async ({ page }) => {
    await page.goto('/music');
    const card = page.locator('a[href="/music/venues/woolys"]');
    await expect(card).toContainText('Next: Woolys Show One', { timeout: 30_000 });
    await expect(card).toContainText('3 shows in the next 2 weeks');

    await page.goto('/music/venues/woolys');
    const list = page.locator('section:has(h2:has-text("Upcoming Events at")) a[href^="/events/"]');
    await expect(list.first()).toBeVisible({ timeout: 30_000 });
    await expect(list).toHaveCount(3);
    await expect(page.locator('section:has(h2:has-text("Upcoming Events at"))')).not.toContainText('Liftoff');
  });

  test("a Casey's Center event gives the arena card a Next: line, under the arena's current name", async ({ page }) => {
    await page.goto('/music');
    const card = page.locator('a[href="/music/venues/wells-fargo-arena"]');
    await expect(card).toContainText('Next: Arena Concert', { timeout: 30_000 });
    await expect(card).toContainText("Casey's Center");

    const text = await page.locator('#root').innerText();
    expect(text).not.toContain('Wells Fargo Arena');
    // Item 5: no seat capacity on a venue card.
    expect(text).not.toContain('16,980');
  });

  test('See all links carry no count', async ({ page }) => {
    await page.goto('/music');
    await expect(page.locator('a[href="/music/venues/woolys"]')).toContainText('Next:', { timeout: 30_000 });
    const seeAll = page.locator('a[href^="/events?category="]');
    await expect(seeAll.first()).toBeVisible();
    for (const text of await seeAll.allInnerTexts()) {
      expect(text).toMatch(/on the events calendar$/);
      expect(text).not.toMatch(/See all/);
    }
  });
});

test.describe('pass 2: honest copy on /sports', () => {
  test('the hero is built from the teams rows; no Wells Fargo Arena, no tailgating, no javascript: link', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/teams?**', (route) => json(route, TEAMS));
    await routeEvents(page, 0, []);
    await page.goto('/sports');

    const hero = page.locator('[data-sports-hero]');
    await expect(hero).toContainText("Iowa Cubs at Principal Park; Iowa Wild at Casey's Center", { timeout: 30_000 });

    const text = await page.locator('#root').innerText();
    expect(text).not.toContain('Wells Fargo Arena');
    expect(text.toLowerCase()).not.toContain('tailgating');
    const description = await page.locator('meta[name="description"]').first().getAttribute('content');
    expect(description ?? '').not.toMatch(/tailgating/i);

    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    // An empty week names each team's own schedule instead.
    await expect(page.getByRole('link', { name: /Iowa Cubs schedule/ })).toHaveAttribute('href', 'https://www.milb.com/iowa');
  });

  test('the hero says nothing while the teams are loading', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/teams?**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      return json(route, TEAMS);
    });
    await routeEvents(page, 0, []);
    await page.goto('/sports');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-sports-hero]')).toHaveText('');
    await expect(page.locator('[data-sports-hero]')).toContainText('Principal Park', { timeout: 15_000 });
  });
});

test.describe('pass 2: the weekend section follows the calendar', () => {
  const SUNDAY_ROWS = [
    row(20, 'Sunday Night Set', '2026-09-28T00:00:00Z', 'Fixture Hall', 'Music'), // Sun 19:00
    row(21, 'Tuesday Folk Night', '2026-09-30T00:00:00Z', 'Other Room', 'Music'), // Tue 19:00
  ];

  test('Sunday 20:00 Central: no weekend section, and the rows are still listed', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-28T01:00:00Z')); // Sun 20:00 CDT
    await installFixtureBackend(page);
    await page.route('**/rest/v1/venues?**', (route) => json(route, VENUES));
    await routeEvents(page, 0, SUNDAY_ROWS);
    await page.goto('/music');

    await expect(page.locator('#music-tonight')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href^="/events/"]:has(h3)', { hasText: 'Sunday Night Set' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#music-weekend')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /This Weekend|Tomorrow \(Sunday\)/ })).toHaveCount(0);
    await expect(page.locator('a:has(h3)', { hasText: 'Tuesday Folk Night' })).toBeVisible();
  });

  test('Saturday: the weekend section is titled Tomorrow (Sunday)', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-26T19:00:00Z')); // Sat 14:00 CDT
    await installFixtureBackend(page);
    await page.route('**/rest/v1/venues?**', (route) => json(route, VENUES));
    await routeEvents(page, 0, SUNDAY_ROWS);
    await page.goto('/music');

    await expect(page.locator('#music-weekend')).toHaveText('Tomorrow (Sunday)', { timeout: 30_000 });
  });
});
