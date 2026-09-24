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
  'No shows scheduled for tonight',
  'No weekend shows listed yet',
  'No upcoming concerts found',
  'No games scheduled for today',
  'No games scheduled this week',
];

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(rows),
  });
}

/** Answer events from EVENTS (optionally after a delay) and record each request URL. */
async function routeEvents(page: Page, delayMs = 0): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/events?**', async (route) => {
    seen.push(route.request().url());
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return json(route, EVENTS);
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
