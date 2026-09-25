/**
 * plan-stay WP3: /visitors-guide is the guide. The /group-travel half of
 * this file moved to tests/group-travel.spec.ts in pass 2.
 *
 * Before this, /visitors-guide said "Check your email for the download link!"
 * when no code sends that email and there is no PDF, and "Your free guide is
 * on its way!" for a printed copy nobody mails. Both handlers ignored
 * supabase-js's { error }, so the success toast fired even when the insert
 * failed. /group-travel promised a reply "within 2 business days" from a table
 * nothing reads, and read a venue outage as "No venues match your filters".
 *
 * Rows come from installFixtureBackend; each test that needs a specific table
 * shape registers its own route AFTER it (the last handler wins). Selectors
 * are roles and plain data-* attributes because vite strips data-testid.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const CORS = { 'access-control-allow-origin': '*' };

/** A PostgREST error that the app's retry policy does not retry, so the error branch shows at once. */
async function failTable(page: Page, table: string) {
  await page.route(`**/rest/v1/${table}*`, (route: Route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ code: 'PGRST100', message: 'fixture failure', details: null, hint: null }),
    }),
  );
}


/** Saturday 3 October 2026, 3 PM Central (CDT, UTC-5). */
const SATURDAY_3PM = new Date('2026-10-03T20:00:00Z');

function event(id: number, title: string, date: string, end_date: string | null = null) {
  return {
    id: `31000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
    title,
    date,
    end_date,
    event_start_utc: date,
    event_start_local: null,
    event_timezone: 'America/Chicago',
    category: 'Music',
    venue: 'Fixture Venue',
    location: 'Des Moines',
    city: 'Des Moines',
    price: null,
    image_url: null,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: null,
    longitude: null,
    source_url: null,
    original_description: null,
    enhanced_description: null,
    is_enhanced: false,
    writeup_generated_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };
}

const FRIDAY_SHOW = event(1, 'Friday Finished Show', '2026-10-03T00:00:00Z'); // Fri 7 PM CDT
const SATURDAY_MORNING = event(2, 'Saturday Morning Run', '2026-10-03T14:00:00Z'); // Sat 9 AM, no end
const SATURDAY_NIGHT = event(3, 'Saturday Night Show', '2026-10-04T00:30:00Z'); // Sat 7:30 PM
const SUNDAY_MARKET = event(4, 'Sunday Market', '2026-10-04T15:00:00Z'); // Sun 10 AM
const FESTIVAL = event(5, 'Fall Fixture Festival', '2026-10-02T22:00:00Z', '2026-10-05T01:00:00Z'); // Fri 5 PM to Sun 8 PM

function restaurant(id: number, name: string, opening: string) {
  return {
    id: `32000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    cuisine: 'American',
    status: 'active',
    opening,
    is_merged: false,
    latitude: null,
    longitude: null,
  };
}

const RESTAURANTS = [
  restaurant(1, 'Dinner Place', 'Daily 11am-10pm'),
  restaurant(2, 'Late Bar', 'Daily 4pm-2am'),
  restaurant(3, 'Lunch Only', 'Daily 11am-2pm'),
  restaurant(4, 'All Day Diner', 'Daily 7am-10pm'),
  restaurant(5, 'Corner Cafe', 'Daily 8am-9pm'),
];

test.describe('/visitors-guide', () => {
  test('links to our own listings and promises no delivery', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/visitors-guide');
    await expect(page.getByRole('heading', { level: 1, name: 'Des Moines Visitor Guide' })).toBeVisible();

    for (const href of ['/events', '/restaurants/open-now', '/stay', '/getting-around']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
    }

    for (const phrase of [/Check your email/i, /on its way/i, /2026 Edition/i, /Request Free Copy/i, /Download Free Guide/i]) {
      await expect(page.getByText(phrase)).toHaveCount(0);
    }
    await expect(page.getByRole('heading', { name: 'Get the weekly Des Moines picks' })).toBeVisible();
  });

  /*
   * plan-stay-pass2 WP3 item 2. The module asked for Friday 00:00 to Sunday
   * with limit 6 and no ongoing rows, so on Saturday afternoon its six slots
   * were Friday's finished shows and a Fri-Sun festival was missing. Clock
   * pinned to Saturday 3 PM Central; the fake backend does not filter, so the
   * finished rows really do reach the page and the page has to drop them.
   */
  test('on Saturday afternoon, lists only what is still ahead, festival included', async ({ page }) => {
    await page.clock.setFixedTime(SATURDAY_3PM);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/events*', (route) => {
      const url = decodeURIComponent(route.request().url());
      // The ongoing read asks for rows that started before the window.
      const rows = /[?&]date=lt\./.test(url) ? [FESTIVAL] : [FRIDAY_SHOW, SATURDAY_MORNING, SATURDAY_NIGHT, SUNDAY_MARKET];
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(rows) });
    });
    await page.goto('/visitors-guide');
    const weekend = page.getByRole('region', { name: 'This weekend' });
    await expect(weekend.getByRole('link', { name: SATURDAY_NIGHT.title })).toBeVisible();
    await expect(weekend.getByRole('link', { name: SUNDAY_MARKET.title })).toBeVisible();
    await expect(weekend.getByRole('link', { name: FESTIVAL.title })).toBeVisible();
    await expect(weekend.getByText(/Ongoing, through Oct 4/)).toBeVisible();
    await expect(weekend.getByText(FRIDAY_SHOW.title)).toHaveCount(0);
    await expect(weekend.getByText(SATURDAY_MORNING.title)).toHaveCount(0);
  });

  test('the prerendered page carries the heading and link, not a frozen list', async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
    await installFixtureBackend(page);
    await page.goto('/visitors-guide');
    const weekend = page.getByRole('region', { name: 'This weekend' });
    await expect(weekend).toBeVisible();
    await expect(weekend.locator('a[href="/events/this-weekend"]')).toBeVisible();
    await expect(weekend.locator('li')).toHaveCount(0);
  });

  test('open now lists three restaurants with their closing time', async ({ page }) => {
    await page.clock.setFixedTime(SATURDAY_3PM);
    await installFixtureBackend(page);
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(RESTAURANTS) }),
    );
    await page.goto('/visitors-guide');
    const heading = page.getByRole('heading', { name: 'Open now' });
    await heading.scrollIntoViewIfNeeded();
    const list = page.locator('[data-open-now-list]');
    await expect(list.locator('li')).toHaveCount(3);
    await expect(list).toContainText('closes 10 PM');
    await expect(list).not.toContainText('Lunch Only');
    await expect(page.locator('a[href="/restaurants/open-now"]').first()).toBeAttached();
  });

  test('links into the trip planner and names no arena by its old name', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/visitors-guide');
    await expect(page.getByRole('link', { name: 'pick your dates' })).toHaveAttribute('href', '/trip-planner');
    await expect(page.getByText(/mi straight line from downtown/).first()).toBeVisible();
    await expect(page.getByText(/Wells Fargo Arena/)).toHaveCount(0);
  });

  test('hides the weekend module when events fail, and keeps the rest', async ({ page }) => {
    await installFixtureBackend(page);
    await failTable(page, 'events');
    await page.goto('/visitors-guide');
    await expect(page.getByRole('heading', { name: 'Open now' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This weekend' })).toHaveCount(0);
    await expect(page.locator('a[href="/getting-around"]').first()).toBeAttached();
  });
});

