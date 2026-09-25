import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay pass 2, WP2 (docs/page-plans/plan-stay-pass2.md).
 *
 * 1. With hotels that have no coordinates, /stay?near= says "listed A-Z" and
 *    never "nearest".
 * 2. An Awin-wrapped Hilton link reads "Book on hilton.com"; no network name
 *    is printed.
 * 3. At 390x844 the first hotel card title is on the first screen.
 * 4. A hotel with coordinates lists a fixture event 0.4 mi away, not one
 *    3 mi away, and links "Plan these dates" to /trip-planner with the dates;
 *    a hotel without coordinates renders no block.
 * 5. Hotel JSON-LD has checkinTime "15:00" for "3:00 PM" and no starRating
 *    for a row the Google Places import created.
 * 6. An unknown ?near= slug says so and Clear drops it; ?q= fills the search.
 *
 * Rows are answered by page.route after installFixtureBackend (the last
 * handler wins). Nothing here filters: the routes return what the scenario
 * needs, and a search returns nothing.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const ARENA = { latitude: 41.5908, longitude: -93.6208 };
const HILTON = 'https://www.hilton.com/en/hotels/dsmfsgi-fixture/';
const AWIN_HILTON = `https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&clickref=desmoines-insider&ued=${encodeURIComponent(HILTON)}`;

function hotel(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `42000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Pass Two Hotel ${i}`,
    slug: `pass-two-hotel-${i}`,
    address: `${200 + i} Fixture Ave`,
    affiliate_provider: null,
    affiliate_url: null,
    affiliate_url_updated_at: null,
    amenities: ['Pool'],
    area: 'Downtown',
    avg_nightly_rate: 139,
    brand_parent: null,
    chain_name: null,
    check_in_time: '15:00',
    check_out_time: '11:00',
    city: 'Des Moines',
    created_at: ISO,
    description: 'A hotel supplied by stay-pass2.spec.ts.',
    email: null,
    google_place_id: null,
    hotel_type: 'Hotel',
    image_url: null,
    is_active: true,
    is_featured: i === 0,
    latitude: null,
    longitude: null,
    phone: '515-555-0101',
    price_range: '$$',
    short_description: 'Fixture hotel.',
    sort_order: i,
    star_rating: 3,
    state: 'IA',
    total_rooms: 90,
    updated_at: ISO,
    website: 'https://hotel.example.com',
    zip: '50309',
    gallery_urls: [],
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    seo_h1: null,
    geo_summary: null,
    geo_key_facts: null,
    geo_faq: null,
    ...extra,
  };
}

type HotelRow = ReturnType<typeof hotel>;

function reply(route: Route, status: number, body: unknown, total: number) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': total > 0 ? `0-${total - 1}/${total}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status, headers, body: '' });
  }
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

async function installHotels(page: Page, table: HotelRow[]) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/hotels**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
    const slugEq = params.get('slug');
    if (wantsObject || slugEq) {
      const rows = table.filter((r) => `eq.${r.slug}` === slugEq);
      if (wantsObject) {
        return rows[0]
          ? reply(route, 200, rows[0], 1)
          : route.fulfill({
              status: 406,
              contentType: 'application/json',
              headers: { 'access-control-allow-origin': '*' },
              body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
            });
      }
      return reply(route, 200, rows, rows.length);
    }
    if (params.get('or')) return reply(route, 200, [], 0);
    let rows = table;
    if (params.get('is_featured') === 'eq.true') rows = rows.filter((r) => r.is_featured);
    if (params.get('latitude') === 'not.is.null') rows = rows.filter((r) => r.latitude !== null);
    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit') || rows.length);
    return reply(route, 200, rows.slice(offset, offset + limit), rows.length);
  });
}

function eventRow(id: number, title: string, latitude: number, startsAt: Date) {
  const iso = startsAt.toISOString();
  return {
    id: `43000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    date: iso,
    end_date: null,
    enhanced_description: null,
    event_start_local: null,
    event_start_utc: iso,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude,
    location: 'Des Moines',
    longitude: ARENA.longitude,
    original_description: 'An event supplied by stay-pass2.spec.ts.',
    price: 'Free',
    source_url: null,
    updated_at: ISO,
    venue: 'Fixture Hall',
    writeup_generated_at: null,
  };
}

/** One event 0.4 mi north of the arena and one about 3 mi north, both tomorrow. */
async function installEvents(page: Page) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setUTCHours(23, 30, 0, 0);
  const near = eventRow(1, 'Near Fixture Show', ARENA.latitude + 0.4 / 69, tomorrow);
  const far = eventRow(2, 'Far Fixture Show', ARENA.latitude + 3 / 69, tomorrow);
  await page.route('**/rest/v1/events**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    // The ongoing half of useEventsInRange asks for rows that started before
    // the window (date=lt.); these both start inside it.
    const startedBefore = params.getAll('date').some((v) => v.startsWith('lt.'));
    const rows = startedBefore ? [] : [near, far];
    return reply(route, 200, rows, rows.length);
  });
}

/** A card is found by its h3; production builds strip data-testid. */
function cardHeadings(page: Page) {
  return page.getByRole('heading', { level: 3, name: /Pass Two Hotel/ });
}

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

test.describe('/stay pass 2', () => {
  test('near a place with no hotel coordinates reads A-Z, never nearest', async ({ page }) => {
    await installHotels(page, Array.from({ length: 5 }, (_, i) => hotel(i)));
    await page.goto('/stay?near=wells-fargo-arena');

    await expect(page.getByText(/No hotel locations yet, so these are listed A-Z/)).toBeVisible();
    await expect(cardHeadings(page)).toHaveCount(5);
    await expect(page.getByText(/nearest/i)).toHaveCount(0);
  });

  test('an unknown near slug says so, and Clear drops it', async ({ page }) => {
    await installHotels(page, Array.from({ length: 3 }, (_, i) => hotel(i)));
    await page.goto('/stay?near=nope');

    await expect(page.getByText("We don't have a location for 'nope' yet.")).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page).not.toHaveURL(/near=/);
    await expect(page.getByText(/We don't have a location/)).toHaveCount(0);
  });

  test('an Awin-wrapped Hilton link names hilton.com, never the network', async ({ page }) => {
    await installHotels(page, [
      hotel(0, { affiliate_url: AWIN_HILTON, affiliate_provider: 'Awin' }),
      hotel(1, {
        affiliate_url: `https://www.anrdoezrs.net/click-1-2?sid=x&url=${encodeURIComponent('https://www.ihg.com/x')}`,
        affiliate_provider: 'Commission Junction',
      }),
    ]);
    await page.goto('/stay');

    await expect(page.getByRole('link', { name: /^Book on hilton\.com/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Book on ihg\.com/ }).first()).toBeVisible();
    await expect(page.getByText(/Book via|Awin|Commission Junction|Partnerize/)).toHaveCount(0);

    await page.goto('/stay/pass-two-hotel-0');
    const book = page.getByRole('link', { name: /^Book on hilton\.com/ }).first();
    await expect(book).toBeVisible();
    await expect(book).toHaveAttribute('rel', /sponsored/);
    await expect(page.getByText(/Book via|Awin|Commission Junction/)).toHaveCount(0);
  });

  test('?q= fills the search box and runs the search', async ({ page }) => {
    await installHotels(page, Array.from({ length: 3 }, (_, i) => hotel(i)));
    await page.goto('/stay?q=Hilton');

    await expect(page.getByRole('textbox', { name: 'Search hotels' })).toHaveValue('Hilton');
    await expect(page.getByText('No hotels match your filters')).toBeVisible();
  });
});

test.describe('/stay on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the first hotel card title is on the first screen', async ({ page }) => {
    await installHotels(page, Array.from({ length: 6 }, (_, i) => hotel(i)));
    await page.goto('/stay');

    const first = cardHeadings(page).first();
    await expect(first).toBeVisible();
    const box = await first.boundingBox();
    expect(box, 'first card title has a box').not.toBeNull();
    expect(box!.y + box!.height, 'first card title bottom').toBeLessThanOrEqual(844);
  });
});

test.describe('/stay/:slug pass 2', () => {
  test("lists what's on within a mile and hands the dates to the planner", async ({ page }) => {
    await installHotels(page, [hotel(0, { latitude: ARENA.latitude, longitude: ARENA.longitude })]);
    await installEvents(page);
    await page.goto('/stay/pass-two-hotel-0');

    const block = page.locator('section[aria-labelledby="hotel-nearby-events-heading"]');
    await expect(block.getByRole('heading', { name: "What's on near this hotel" })).toBeVisible();
    await expect(block.getByRole('link', { name: /Near Fixture Show/ })).toBeVisible();
    await expect(block.getByText(/0\.4 mi/)).toBeVisible();
    await expect(block.getByText('Far Fixture Show')).toHaveCount(0);

    const plan = block.getByRole('link', { name: 'Plan these dates' });
    await expect(plan).toHaveAttribute('href', `/trip-planner?from=${isoDay(0)}&to=${isoDay(6)}`);
  });

  test('carries a trip window from the URL', async ({ page }) => {
    await installHotels(page, [hotel(0, { latitude: ARENA.latitude, longitude: ARENA.longitude })]);
    await installEvents(page);
    const from = isoDay(1);
    const to = isoDay(3);
    await page.goto(`/stay/pass-two-hotel-0?from=${from}&to=${to}`);

    await expect(page.getByText(/during your dates/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plan these dates' })).toHaveAttribute(
      'href',
      `/trip-planner?from=${from}&to=${to}`,
    );
  });

  test('a hotel without coordinates renders no nearby-events block', async ({ page }) => {
    await installHotels(page, [hotel(0)]);
    await installEvents(page);
    await page.goto('/stay/pass-two-hotel-0');

    await expect(page.getByRole('heading', { level: 1, name: 'Pass Two Hotel 0' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "What's on near this hotel" })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Plan these dates' })).toHaveCount(0);
  });

  test('JSON-LD: 3:00 PM becomes 15:00, and a Places row has no starRating', async ({ page }) => {
    await installHotels(page, [
      hotel(0, {
        check_in_time: '3:00 PM',
        check_out_time: 'late',
        google_place_id: 'ChIJfixture',
        star_rating: 4.5,
      }),
    ]);
    await page.goto('/stay/pass-two-hotel-0');
    await expect(page.getByRole('heading', { level: 1, name: 'Pass Two Hotel 0' })).toBeVisible();

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const hotelLd = ld.find((t) => t.includes('"@type":"Hotel"'));
    expect(hotelLd).toBeTruthy();
    const parsed = JSON.parse(hotelLd!);
    expect(parsed.checkinTime).toBe('15:00');
    expect(parsed.checkoutTime).toBeUndefined();
    expect(parsed.starRating).toBeUndefined();
    // Nor does the page print a review average as a hotel class.
    await expect(page.getByText(/4\.5 stars|4\.5-star/)).toHaveCount(0);
  });

  test('breadcrumb is labelled and marks the current page', async ({ page }) => {
    await installHotels(page, [hotel(0)]);
    await page.goto('/stay/pass-two-hotel-0');

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toBeVisible();
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Pass Two Hotel 0');
  });
});
