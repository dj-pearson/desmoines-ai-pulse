import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay WP2: /stay and /stay/:slug (docs/page-plans/plan-stay.md).
 *
 * 1. A populated grid shows no EmptyState; a no-match search shows only
 *    "No hotels match your filters".
 * 2. A comma in the search box no longer 400s the list. The hotels route below
 *    answers 400 the way PostgREST does when or(...) does not split into its
 *    four clauses, so the old unsanitized query fails here as it did live.
 * 3. With 63 rows the page reads "Showing 24 of 63", and "Show more" appends
 *    the next page from the hook's offset.
 * 4. /stay?near=wells-fargo-arena lists hotels nearest-first, labels the
 *    distance as a straight line under the arena's current name, and
 *    survives a reload.
 * 5. A javascript: affiliate_url renders no Book link, and a description
 *    holding "</script>" is escaped inside the Hotel JSON-LD.
 * 6. No hotel surface says "From $".
 *
 * The hotels route is registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match. It honours limit/offset and
 * the featured flag (paging, not filtering); a search either 400s, when the
 * or() clause count is wrong, or returns nothing.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const TOTAL = 63;
const ARENA = { latitude: 41.5908, longitude: -93.6208 };

function hotel(i: number, extra: Record<string, unknown> = {}) {
  // Distance from the arena is unrelated to the index: 5 is a unit mod 63, so
  // every row gets a different step, and the nearest one is row 47.
  const step = (i * 5 + 17) % TOTAL;
  return {
    id: `41000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Stay Fixture Hotel ${i}`,
    slug: `stay-fixture-hotel-${i}`,
    address: `${100 + i} Fixture St`,
    affiliate_provider: null,
    affiliate_url: null,
    affiliate_url_updated_at: null,
    amenities: ['Pool', 'Free Parking'],
    area: 'Downtown',
    avg_nightly_rate: 129,
    brand_parent: null,
    chain_name: null,
    check_in_time: '15:00',
    check_out_time: '11:00',
    city: 'Des Moines',
    created_at: ISO,
    description: 'A hotel supplied by stay.spec.ts.',
    email: null,
    google_place_id: null,
    hotel_type: 'Hotel',
    image_url: null,
    is_active: true,
    is_featured: i < 3,
    latitude: ARENA.latitude + step * 0.002,
    longitude: ARENA.longitude,
    phone: '515-555-0100',
    price_range: '$$',
    short_description: 'Fixture hotel.',
    sort_order: i,
    star_rating: 3,
    state: 'IA',
    total_rooms: 120,
    updated_at: ISO,
    website: 'https://hotel.example.com',
    zip: '50309',
    gallery_urls: [],
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    geo_summary: null,
    geo_key_facts: null,
    geo_faq: null,
    ...extra,
  };
}

const HOSTILE = hotel(62, {
  name: 'Hostile Fixture Hotel',
  slug: 'hostile-fixture-hotel',
  affiliate_url: 'javascript:alert(1)',
  // What generate-hotel-affiliate-urls actually stores: the network name.
  affiliate_provider: 'Awin',
  website: 'javascript:alert(2)',
  description: 'Great stay.</script><script>window.__pwned = 1</script>',
});

const ROWS = [...Array.from({ length: TOTAL - 1 }, (_, i) => hotel(i)), HOSTILE];

function reply(route: Route, status: number, body: unknown, total: number) {
  const headers = {
    'access-control-allow-origin': '*',
    // Cross-origin, supabase-js can only read the count if it is exposed.
    'access-control-expose-headers': 'content-range',
    'content-range': total > 0 ? `0-${total - 1}/${total}` : '*/0',
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status, headers, body: '' });
  }
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

/** Top-level clauses in a PostgREST or=(...) value. */
function clauseCount(orValue: string): number {
  const inner = orValue.replace(/^\(/, '').replace(/\)$/, '');
  return inner.split(',').length;
}

async function installHotels(page: Page, table: Array<ReturnType<typeof hotel>> = ROWS) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/hotels**', (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');

    if (wantsObject) {
      const slug = (params.get('slug') || '').replace(/^eq\./, '');
      const row = table.find((r) => r.slug === slug);
      return row
        ? reply(route, 200, row, 1)
        : route.fulfill({
            status: 406,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
          });
    }

    const or = params.get('or');
    if (or) {
      if (clauseCount(or) !== 4) {
        return reply(route, 400, { code: 'PGRST100', message: 'failed to parse logic tree' }, 0);
      }
      return reply(route, 200, [], 0);
    }

    let rows = table;
    // maybeSingle() on a GET reads an array and checks its length, so the
    // detail read has to get one row here, not all 63.
    const slugEq = params.get('slug');
    if (slugEq) rows = rows.filter((r) => `eq.${r.slug}` === slugEq);
    if (params.get('is_featured') === 'eq.true') rows = rows.filter((r) => r.is_featured);
    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit') || rows.length);
    return reply(route, 200, rows.slice(offset, offset + limit), rows.length);
  });
}

/** A card is found by its h3; production builds strip data-testid. */
function cardHeadings(page: Page) {
  return page.getByRole('heading', { level: 3, name: /Fixture Hotel/ });
}

test.describe('/stay hotels hub', () => {
  test('populated grid has no empty state and reads Showing 24 of 63', async ({ page }) => {
    await installHotels(page);
    await page.goto('/stay');

    await expect(page.getByText(/Showing 24 of 63 hotels/)).toBeVisible();
    // Three in the featured strip plus 21 in the grid; the strip's rows are
    // not repeated below it.
    await expect(cardHeadings(page)).toHaveCount(24);
    await expect(page.getByRole('heading', { name: 'Stay Fixture Hotel 0' })).toHaveCount(1);
    await expect(page.getByText('No hotels available yet')).toHaveCount(0);
    await expect(page.getByText('No hotels match your filters')).toHaveCount(0);
    await expect(page.getByText(/From \$/)).toHaveCount(0);
    await expect(page.getByText(/Typically about \$129\/night/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Show more hotels' }).click();
    await expect(page.getByText(/Showing 48 of 63 hotels/)).toBeVisible();
    await expect(cardHeadings(page)).toHaveCount(48);
  });

  test('a search with a comma reaches the no-match state, not an error', async ({ page }) => {
    await installHotels(page);
    await page.goto('/stay');
    await expect(cardHeadings(page).first()).toBeVisible();

    await page.getByRole('textbox', { name: 'Search hotels' }).fill('Hilton, Downtown');
    await expect(page.getByText('No hotels match your filters')).toBeVisible();
    await expect(page.getByText('No hotels available yet')).toHaveCount(0);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test('?near= sorts nearest-first with straight-line labels and survives reload', async ({ page }) => {
    await installHotels(page);
    await page.goto('/stay?near=wells-fargo-arena');

    await expect(cardHeadings(page).first()).toHaveText('Stay Fixture Hotel 47');
    await expect(cardHeadings(page).nth(1)).toHaveText('Stay Fixture Hotel 22');
    // The slug keeps the old name; the page says the building's current one.
    await expect(page.getByText(/mi from Casey's Center \(straight line\)/).first()).toBeVisible();
    await expect(page.getByText(/Wells Fargo Arena/)).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(/near=wells-fargo-arena/);
    await expect(cardHeadings(page).first()).toHaveText('Stay Fixture Hotel 47');
  });

  test('a javascript: affiliate URL renders no link on the hub', async ({ page }) => {
    await installHotels(page);
    await page.goto('/stay?near=wells-fargo-arena');

    // Row 62 is the thirteenth nearest, so it is on the first near page.
    await expect(page.getByRole('heading', { level: 3, name: 'Hostile Fixture Hotel' })).toBeVisible();
    await expect(cardHeadings(page)).toHaveCount(24);
    // Every other card has an https website, so 23 website links and none for
    // the hostile row.
    await expect(page.getByRole('link', { name: /^Hotel website/ })).toHaveCount(23);
    await expect(page.getByRole('link', { name: /^Book (on|via)/ })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });
});

test.describe('/stay/:slug hotel detail', () => {
  test('hostile row: no javascript: link, JSON-LD escaped, honest rate', async ({ page }) => {
    await installHotels(page);
    await page.goto('/stay/hostile-fixture-hotel');

    await expect(page.getByRole('heading', { level: 1, name: 'Hostile Fixture Hotel' })).toBeVisible();
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^(Book on|Book via|Hotel website|Visit Website)/ })).toHaveCount(0);
    await expect(page.getByText(/From \$/)).toHaveCount(0);
    await expect(page.getByText('Typically about $129/night; rates change by date')).toBeVisible();

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const hotelLd = ld.find((t) => t.includes('"@type":"Hotel"'));
    expect(hotelLd).toBeTruthy();
    expect(hotelLd).not.toContain('</script');
    expect(hotelLd).toContain('\\u003c/script');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('an affiliate link names the site it lands on and is disclosed', async ({ page }) => {
    // The shape generate-hotel-affiliate-urls writes for Hilton: an Awin
    // redirect with the brand URL in ued, and the network in affiliate_provider.
    const hilton = 'https://www.hilton.com/en/hotels/dsmfsgi-fixture/';
    await installHotels(page, [
      hotel(5, {
        affiliate_url: `https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&clickref=desmoines-insider&ued=${encodeURIComponent(hilton)}`,
        affiliate_provider: 'Awin',
      }),
    ]);
    await page.goto('/stay/stay-fixture-hotel-5');

    const book = page.getByRole('link', { name: /^Book on hilton\.com/ });
    await expect(book).toBeVisible();
    await expect(book).toHaveAttribute('rel', /sponsored/);
    await expect(page.getByText(/Affiliate link: we may earn a commission/)).toBeVisible();
    await expect(page.getByText(/Book via Awin|Commission Junction/)).toHaveCount(0);
    // The hotel's own site is still offered, and is not marked sponsored.
    const site = page.getByRole('link', { name: 'Visit Website' });
    await expect(site).toHaveAttribute('href', 'https://hotel.example.com/');
    await expect(site).not.toHaveAttribute('rel', /sponsored/);
  });
});
