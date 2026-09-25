import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP7: /deals.
 *
 * 1. The list query says the active window itself (start_date=lte, end_date
 *    null-or-gte), so an admin, whom the FOR ALL policy lets read every row,
 *    sees the set the public sees.
 * 2. A Tue-Thu 16:00-18:00 deal shows its schedule, and under ?when=now it is
 *    listed with "Live now" at Wed 17:00 CT and filtered out at Mon 12:00 CT.
 * 3. A deal whose created_at and start_date are both months old is not "New".
 * 4. A failed claim leaves the code on screen, and a rejected clipboard write
 *    falls back to "Press and hold to copy".
 * 5. The business name links to the venue resolved from entity_id.
 *
 * Explore pass 2 WP6 (docs/page-plans/explore-pass2.md):
 * 6. The list selects named columns, not *, so created_by and
 *    redemption_count stay off the wire.
 * 7. No "Exclusive" and no "Verified" anywhere on the page, even for a row
 *    with is_verified = true.
 * 8. The chip and the badge both say "Running now"; under a time filter the
 *    unscheduled deals are listed apart as "Good any time".
 * 9. A scheduled deal says "Starts 4 PM" before its window.
 * 10. A hotel deal links /stay/<slug>.
 * 11. The empty list links somewhere useful.
 *
 * Table overrides are registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match.
 */

const WED_5PM_CT = new Date('2026-09-23T22:00:00Z');
const MON_NOON_CT = new Date('2026-09-21T17:00:00Z');
const OLD = '2026-01-15T12:00:00Z';
const RESTAURANT_ID = '71000000-0000-0000-0000-000000000001';

function deal(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `70000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Fixture Deal ${i}`,
    description: 'A deal supplied by deals.spec.ts.',
    business_name: `Fixture Business ${i}`,
    entity_type: 'restaurant',
    entity_id: null,
    deal_type: 'percentage',
    discount_value: '20% off',
    code: `CODE${i}`,
    terms: null,
    start_date: OLD,
    end_date: '2026-12-31T23:59:59Z',
    image_url: null,
    is_verified: true,
    is_featured: false,
    redemption_count: 0,
    created_at: OLD,
    created_by: null,
    days_of_week: null,
    start_time: null,
    end_time: null,
    ...extra,
  };
}

const HAPPY_HOUR = deal(1, {
  title: 'Weeknight Happy Hour',
  business_name: 'Fixture Taproom',
  entity_id: RESTAURANT_ID,
  days_of_week: ['tue', 'wed', 'thu'],
  start_time: '16:00:00',
  end_time: '18:00:00',
  is_featured: true,
});
const ALL_DAY = deal(2, { title: 'Any Day Special' });
const HOTEL_ID = '72000000-0000-0000-0000-000000000001';
const HOTEL_DEAL = deal(3, {
  title: 'Weekend Room Rate',
  business_name: 'Fixture Hotel',
  entity_type: 'hotel',
  entity_id: HOTEL_ID,
});

const headers = { 'access-control-allow-origin': '*' };

function fulfilRows(route: Route, rows: unknown[]) {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

async function installDeals(page: Page, rows: unknown[] = [HAPPY_HOUR, ALL_DAY]) {
  await installFixtureBackend(page);
  const dealQueries: string[] = [];
  await page.route('**/rest/v1/deals**', (route) => {
    dealQueries.push(decodeURIComponent(route.request().url()));
    return fulfilRows(route, rows);
  });
  await page.route('**/rest/v1/restaurants**', (route) =>
    fulfilRows(route, [{ id: RESTAURANT_ID, slug: 'fixture-taproom' }]),
  );
  await page.route('**/rest/v1/hotels**', (route) =>
    fulfilRows(route, [{ id: HOTEL_ID, slug: 'fixture-hotel' }]),
  );
  return dealQueries;
}

test.describe('/deals', () => {
  test('the list query carries the active date window', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    const queries = await installDeals(page);
    await page.goto('/deals');
    await expect(page.getByRole('heading', { name: 'Weeknight Happy Hour' })).toBeVisible();

    const list = queries.find((q) => q.includes('select=id,'));
    expect(list, 'no deals list request was made').toBeTruthy();
    expect(list).toMatch(/start_date=lte\./);
    expect(list).toMatch(/or=\(end_date\.is\.null,end_date\.gte\./);
    expect(queries.some((q) => q.includes('select=*')), 'deals list went back to select=*').toBe(false);
    expect(list).not.toContain('created_by');
    expect(list).not.toContain('redemption_count');
  });

  test('a Tue-Thu 4-6 PM deal is live at Wed 17:00 CT', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals?when=now');

    const card = page.locator('div', { has: page.getByRole('heading', { name: 'Weeknight Happy Hour' }) }).last();
    await expect(page.getByRole('heading', { name: 'Weeknight Happy Hour' })).toBeVisible();
    await expect(card.getByText('Tue-Thu, 4-6 PM')).toBeVisible();
    await expect(card.getByText('Running now', { exact: true })).toBeVisible();
    await expect(card.getByText('Featured', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Running now' })).toHaveAttribute('aria-pressed', 'true');
    // The deal with no days or hours is listed apart, not mixed in.
    const anyTime = page.getByRole('region', { name: 'Good any time' });
    await expect(anyTime.getByRole('heading', { name: 'Any Day Special' })).toBeVisible();
    await expect(anyTime.getByRole('heading', { name: 'Weeknight Happy Hour' })).toHaveCount(0);
  });

  test('the same deal is filtered out at Mon 12:00 CT', async ({ page }) => {
    await page.clock.setFixedTime(MON_NOON_CT);
    await installDeals(page);
    await page.goto('/deals?when=now');

    await expect(page.getByRole('heading', { name: 'Any Day Special' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Weeknight Happy Hour' })).toHaveCount(0);
  });

  test('a months-old deal is not labelled New', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals');

    await expect(page.getByRole('heading', { name: 'Any Day Special' })).toBeVisible();
    await expect(page.getByText('New this week')).toHaveCount(0);
  });

  test('the business name links to the venue', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals');

    await expect(page.getByRole('link', { name: 'Fixture Taproom' })).toHaveAttribute(
      'href',
      '/restaurants/fixture-taproom',
    );
  });

  test('an unknown ?category= shows all deals', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals?category=nonsense');

    await expect(page.getByRole('heading', { name: 'Any Day Special' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Deals' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a failed claim keeps the code, and a rejected clipboard falls back', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await installDeals(page, [ALL_DAY]);
    let claimCalls = 0;
    await page.route('**/rest/v1/rpc/increment_deal_redemption**', (route) => {
      claimCalls += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ code: 'XX000', message: 'fixture failure' }),
      });
    });
    await page.goto('/deals');

    await page.getByRole('button', { name: 'Show code' }).click();
    await expect(page.getByText('CODE2', { exact: true })).toBeVisible();
    await expect.poll(() => claimCalls).toBe(1);
    // Still there after the RPC failed.
    await expect(page.getByText('CODE2', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Copy promo code' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Press and hold to copy' })).toBeVisible();
  });

  test('no Exclusive and no Verified on the page', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals');

    await expect(page.getByRole('heading', { name: 'Any Day Special' })).toBeVisible();
    const main = page.locator('body');
    await expect(main).not.toContainText(/exclusive/i);
    await expect(page.getByText('Verified', { exact: true })).toHaveCount(0);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description ?? '').not.toMatch(/exclusive/i);
  });

  test('a later window says when it starts', async ({ page }) => {
    // Wed 12:00 CT, four hours before the 4-6 PM window.
    await page.clock.setFixedTime(new Date('2026-09-23T17:00:00Z'));
    await installDeals(page);
    await page.goto('/deals');

    const card = page.locator('div', { has: page.getByRole('heading', { name: 'Weeknight Happy Hour' }) }).last();
    await expect(card.getByText('Starts 4 PM')).toBeVisible();
    await expect(card.getByText('Running now', { exact: true })).toHaveCount(0);
  });

  test('a hotel deal links its /stay page', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page, [HOTEL_DEAL]);
    await page.goto('/deals');

    await expect(page.getByRole('link', { name: 'Fixture Hotel' })).toHaveAttribute('href', '/stay/fixture-hotel');
  });

  test('the revealed deal restates what it is and until when', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page, [ALL_DAY]);
    await page.route('**/rest/v1/rpc/increment_deal_redemption**', (route) =>
      route.fulfill({ status: 204, headers, body: '' }),
    );
    await page.goto('/deals');

    await page.getByRole('button', { name: 'Show code' }).click();
    await expect(page.getByText('Valid through Dec 31, 2026')).toBeVisible();
  });

  test('an empty list links somewhere useful', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page, []);
    await page.goto('/deals');

    await expect(page.getByRole('heading', { name: 'No deals listed right now' })).toBeVisible();
    // The footer also links /events/today; scope to the empty state's own list.
    const next = page.locator('ul', { has: page.getByRole('link', { name: 'Run a deal at your business? Tell us' }) });
    await expect(next.getByRole('link', { name: 'Restaurants open now' })).toHaveAttribute('href', '/restaurants/open-now');
    await expect(next.getByRole('link', { name: 'Events today' })).toHaveAttribute('href', '/events/today');
    await expect(next.getByRole('link', { name: 'Run a deal at your business? Tell us' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  test('the Explore row marks Deals as the current section', async ({ page }) => {
    await page.clock.setFixedTime(WED_5PM_CT);
    await installDeals(page);
    await page.goto('/deals');

    const row = page.getByRole('navigation', { name: 'Explore Des Moines' });
    await expect(row.getByRole('link', { name: 'Deals' })).toHaveAttribute('aria-current', 'page');
  });
});
