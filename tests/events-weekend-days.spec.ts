import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * /events/this-weekend day handling (plan-stay hand-off to Events WP5,
 * docs/page-plans/plan-stay.md "Hand-offs to other plans").
 *
 * Clock fixed at Saturday 2026-09-26, noon CDT.
 *
 * 1. Friday is over, so it is collapsed and renders no cards until opened.
 * 2. A festival that opened Thursday and runs to Sunday is listed under
 *    today (Saturday), not dropped and not tucked under Friday.
 * 3. Location chips are cities, not venue strings.
 * 4. "Our weekend picks" lists featured / written-up events and links to
 *    /trip-planner with the rest of the weekend as the window.
 *
 * The events handler returns every row for every events request, including
 * the is_indoor lookup: grouping is what's under test, not the bounds.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const SAT_NOON_CT = new Date('2026-09-26T17:00:00Z');

function event(i: number, dateUtc: string, extra: Record<string, unknown> = {}) {
  return {
    id: `54000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Weekend Fixture Event ${i}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    updated_at: ISO,
    date: dateUtc,
    end_date: null,
    enhanced_description: null,
    original_description: 'An event supplied by events-weekend-days.spec.ts.',
    event_start_local: null,
    event_start_utc: dateUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5908,
    longitude: -93.6208,
    location: 'Wells Fargo Arena, 233 Center St',
    venue: 'Wells Fargo Arena',
    price: 'Free',
    source_url: null,
    writeup_generated_at: null,
    ...extra,
  };
}

const EVENTS = [
  // Thursday 10am CDT to Sunday 9pm CDT, featured.
  event(1, '2026-09-24T15:00:00+00:00', {
    title: 'Weekend Fixture Festival',
    end_date: '2026-09-28T02:00:00+00:00',
    is_featured: true,
  }),
  // Friday 7pm CDT, no end: over by Saturday.
  event(2, '2026-09-26T00:00:00+00:00', { title: 'Weekend Fixture Friday Show' }),
  // Saturday 7pm CDT, West Des Moines.
  event(3, '2026-09-27T00:00:00+00:00', {
    title: 'Weekend Fixture Saturday Show',
    city: 'West Des Moines',
    venue: 'Valley Junction',
    location: 'Valley Junction, 5th St',
  }),
  // Sunday 1pm CDT, with a write-up.
  event(4, '2026-09-27T18:00:00+00:00', {
    title: 'Weekend Fixture Sunday Brunch',
    writeup_generated_at: ISO,
  }),
];

function reply(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function installWeekend(page: Page) {
  await page.clock.setFixedTime(SAT_NOON_CT);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events**', (route) => reply(route, EVENTS));
}

test.describe('/events/this-weekend on a Saturday', () => {
  test('Friday is collapsed, the festival is under today, chips are cities', async ({ page }) => {
    await installWeekend(page);
    await page.goto('/events/this-weekend');

    const friday = page.locator('details[data-day-phase="past"]');
    await expect(friday).toHaveCount(1);
    await expect(friday).toHaveAttribute('data-weekend-day', '2026-09-25');
    await expect(friday).not.toHaveAttribute('open', '');
    await expect(page.getByText('Weekend Fixture Friday Show')).toHaveCount(0);

    await friday.locator('summary').click();
    await expect(friday.getByText('Weekend Fixture Friday Show')).toBeVisible();

    const today = page.locator('section[data-day-phase="today"]');
    await expect(today).toHaveAttribute('data-weekend-day', '2026-09-26');
    await expect(today.getByText('Weekend Fixture Festival').first()).toBeVisible();
    await expect(today.getByText('Weekend Fixture Saturday Show').first()).toBeVisible();

    const location = page.getByRole('group', { name: 'Location' });
    await expect(location.getByRole('button', { name: 'West Des Moines' })).toBeVisible();
    await expect(location.getByRole('button', { name: 'Des Moines', exact: true })).toBeVisible();
    await expect(location.getByRole('button', { name: 'Wells Fargo Arena' })).toHaveCount(0);
  });

  test('picks list featured then written-up events and link to the trip planner', async ({ page }) => {
    await installWeekend(page);
    await page.goto('/events/this-weekend');

    const picks = page.locator('section[aria-labelledby="weekend-picks"]');
    await expect(picks.getByRole('heading', { name: 'Our weekend picks' })).toBeVisible();
    const links = picks.getByRole('listitem').getByRole('link');
    await expect(links).toHaveText(['Weekend Fixture Festival', 'Weekend Fixture Sunday Brunch']);
    await expect(picks.getByRole('link', { name: 'Plan this weekend' })).toHaveAttribute(
      'href',
      '/trip-planner?from=2026-09-26&to=2026-09-27',
    );
  });
});
