import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Business plan WP1: the /advertise builder.
 *
 * What these pin that a unit test can't: the total on the page is the one the
 * pricing RPC returned for the days the DATES span (not a per-placement Days
 * box, not a browser-side formula), the stored placement carries that same
 * day count, a double click can't buy twice, a 409 from checkout shows the
 * server's new total without a second campaign, a deep link shows the
 * listing's database name, and on a phone the total and the button are on
 * screen as soon as a placement is ticked.
 *
 * Route-mocked on top of fixtureBackend: the smoke lane builds with
 * placeholder VITE_SUPABASE_* and must never need a backend. The clock is
 * fixed so "Oct 1-30" is always far enough out for the 3-day lead time.
 */

const USER_ID = '00000000-0000-4000-8000-00000000b001';
const CAMPAIGN_ID = '11111111-0000-4000-8000-00000000b001';
const RESTAURANT_ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const RESTAURANT_NAME = 'Harbinger Test Kitchen';

// Noon on Sunday Sep 20 in Des Moines: earliest start is Sep 23.
const NOW = new Date('2026-09-20T17:00:00Z');

/** What the stubbed calculate_campaign_pricing answers for 30 days of top_banner. */
const TOP_BANNER_30_DAYS = 255;
const CHANGED_TOTAL = 270;

const RATE_CARD = [
  { placement_type: 'top_banner', base_daily_rate: 10, cpm_rate: 10, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
  { placement_type: 'featured_spot', base_daily_rate: 5, cpm_rate: 10, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
  { placement_type: 'below_fold', base_daily_rate: 5, cpm_rate: 10, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
  { placement_type: 'sponsored_listing', base_daily_rate: 15, cpm_rate: 10, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
];

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

function seedConsent(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
      );
    } catch {
      /* private mode - the assertions fail, not this */
    }
  });
}

function seedSession(page: Page) {
  return page.addInitScript(
    ({ userId, storageKey }) => {
      const session = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'advertiser@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        /* see seedConsent */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

interface Recorded {
  campaignPosts: number;
  cancelledIds: string[];
  placementBodies: Array<Array<Record<string, unknown>>>;
  checkoutCalls: number;
}

interface MockOptions {
  signedIn?: boolean;
  checkout?: (call: number) => { status: number; body: unknown };
}

async function mockBuilder(page: Page, options: MockOptions = {}): Promise<Recorded> {
  const { signedIn = true, checkout } = options;
  await page.clock.setFixedTime(NOW);
  await seedConsent(page);
  if (signedIn) await seedSession(page);
  await installFixtureBackend(page);

  const recorded: Recorded = { campaignPosts: 0, cancelledIds: [], placementBodies: [], checkoutCalls: 0 };

  if (signedIn) {
    await page.route('**/auth/v1/**', (route) => {
      if (route.request().url().includes('/user')) {
        return json(route, {
          id: USER_ID, aud: 'authenticated', role: 'authenticated',
          email: 'advertiser@example.com', app_metadata: {}, user_metadata: {},
          created_at: new Date().toISOString(),
        });
      }
      return json(route, {});
    });
  }

  // Registered after fixtureBackend, so this wins; anything it doesn't know
  // falls back to the fixtures.
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes('/rpc/calculate_campaign_pricing')) {
      const body = (request.postDataJSON() ?? {}) as { p_placement_type?: string; p_days_count?: number };
      const days = Number(body.p_days_count);
      const rate = RATE_CARD.find((r) => r.placement_type === body.p_placement_type)!;
      // A known answer for the acceptance case; anything else is a plain
      // product, which the page must print as given.
      const total = body.p_placement_type === 'top_banner' && days === 30 ? TOP_BANNER_30_DAYS : rate.base_daily_rate * days;
      return json(route, [
        { base_price: rate.base_daily_rate, daily_price: total / days, demand_multiplier: 1, traffic_multiplier: 1, total_price: total },
      ]);
    }
    if (url.includes('/rpc/cancel_campaign')) {
      const body = (request.postDataJSON() ?? {}) as { p_campaign_id?: string };
      recorded.cancelledIds.push(String(body.p_campaign_id));
      return json(route, 'cancelled');
    }
    if (url.includes('/rest/v1/ad_rate_card')) return json(route, RATE_CARD);
    if (url.includes('/rest/v1/campaigns') && method === 'POST') {
      recorded.campaignPosts += 1;
      return json(route, {
        id: CAMPAIGN_ID, user_id: USER_ID, name: 'Patio season', status: 'draft',
        start_date: '2026-10-01', end_date: '2026-10-30', total_cost: TOP_BANNER_30_DAYS,
        created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
      }, 201);
    }
    if (url.includes('/rest/v1/campaign_placements') && method === 'POST') {
      recorded.placementBodies.push(request.postDataJSON() as Array<Record<string, unknown>>);
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }
    if (url.includes('/rest/v1/restaurants') && url.includes(`id=eq.${RESTAURANT_ID}`)) {
      return json(route, {
        id: RESTAURANT_ID, name: RESTAURANT_NAME, cuisine: 'American', location: 'East Village', image_url: null,
      });
    }
    return route.fallback();
  });

  await page.route('**/functions/v1/create-campaign-checkout', (route) => {
    recorded.checkoutCalls += 1;
    const answer = checkout
      ? checkout(recorded.checkoutCalls)
      : { status: 200, body: { url: '/advertise/success?test=1' } };
    return json(route, answer.body, answer.status);
  });

  return recorded;
}

async function pickDay(page: Page, day: number) {
  await page
    .locator('[role="dialog"][data-state="open"] button[name="day"]:not(.day-outside)', { hasText: new RegExp(`^${day}$`) })
    .click();
}

async function chooseOct1To30(page: Page) {
  await page.getByRole('button', { name: /^Start date,/ }).click();
  await page.getByRole('button', { name: /next month/i }).click();
  await pickDay(page, 1);
  await page.getByRole('button', { name: /^End date,/ }).click();
  await pickDay(page, 30);
}

test.describe('/advertise builder (business WP1)', () => {
  test('shows the server total for the dates and stores the same day count', async ({ page }) => {
    const recorded = await mockBuilder(page);
    await page.goto('/advertise');

    await page.getByRole('checkbox', { name: 'Top Banner' }).click();
    await expect(page.getByRole('region', { name: 'Total' })).toContainText('Pick dates for the total');

    await chooseOct1To30(page);
    await expect(page.getByRole('button', { name: 'Start date, October 1, 2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End date, October 30, 2026' })).toBeVisible();

    await expect(page.locator('#advertise-total')).toHaveText('$255.00');
    await expect(page.getByRole('region', { name: 'Total' })).toContainText('30 days. This is the amount checkout charges.');
    // No per-placement Days box survives.
    await expect(page.locator('input[type="number"]')).toHaveCount(0);

    await page.getByLabel('Only you and our reviewers see it.').fill('Patio season');
    await page.getByRole('button', { name: 'Continue to payment' }).click();

    await expect.poll(() => recorded.placementBodies.length).toBe(1);
    expect(recorded.placementBodies[0]).toEqual([
      expect.objectContaining({ placement_type: 'top_banner', days_count: 30 }),
    ]);
  });

  test('a double click creates one campaign, and a 409 shows the new total and pays it on a fresh draft', async ({ page }) => {
    const recorded = await mockBuilder(page, {
      checkout: () => ({ status: 409, body: { error: 'PRICE_CHANGED', currentTotal: CHANGED_TOTAL, storedTotal: TOP_BANNER_30_DAYS } }),
    });
    await page.goto('/advertise');

    await page.getByRole('checkbox', { name: 'Top Banner' }).click();
    await chooseOct1To30(page);
    await page.getByLabel('Only you and our reviewers see it.').fill('Patio season');
    await expect(page.locator('#advertise-total')).toHaveText('$255.00');

    await page.getByRole('button', { name: 'Continue to payment' }).dblclick();

    await expect(page.locator('#changed-total')).toHaveText('$270.00');
    await expect(page.getByRole('button', { name: 'Pay $270.00' })).toBeVisible();
    expect(recorded.campaignPosts).toBe(1);
    expect(recorded.checkoutCalls).toBe(1);

    // Paying the new total replaces the draft. create-campaign-checkout never
    // rewrites a draft's stored totals after a 409, so retrying the SAME
    // campaign would 409 forever; a fresh one is priced by the placement
    // trigger at today's rate card, and the stale draft is cancelled.
    await page.getByRole('button', { name: 'Pay $270.00' }).click();
    await expect.poll(() => recorded.checkoutCalls).toBe(2);
    expect(recorded.campaignPosts).toBe(2);
    await expect.poll(() => recorded.cancelledIds).toEqual([CAMPAIGN_ID]);
  });

  test('a claim link preselects the restaurant by its database name', async ({ page }) => {
    await mockBuilder(page);
    await page.goto(`/advertise?listing_type=restaurant&listing_id=${RESTAURANT_ID}&listingName=Not%20the%20real%20name`);

    await expect(page.locator('#linked-listing-name')).toHaveText(RESTAURANT_NAME);
    await expect(page.getByRole('checkbox', { name: 'Sponsored Listing' })).toBeChecked();
    await expect(page.getByText('Not the real name')).toHaveCount(0);
  });

  test('an attraction link says sponsorship does not cover it yet', async ({ page }) => {
    await mockBuilder(page);
    await page.goto(`/advertise?listing_type=attraction&listing_id=${RESTAURANT_ID}`);
    await expect(page.getByText(/can't be sponsored yet/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Sponsored Listing' })).not.toBeChecked();
  });

  test('says nothing it cannot measure', async ({ page }) => {
    await mockBuilder(page);
    await page.goto('/advertise');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Advertise on Des Moines Insider');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/50K\+|15K\+|95%|thousands|555-|CPM|every hour|Demographics/);
  });
});

test.describe('/advertise builder on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the total and the button are on screen once a placement is ticked', async ({ page }) => {
    await mockBuilder(page);
    await page.goto('/advertise');

    await page.getByRole('checkbox', { name: 'Below the Fold' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));

    const summary = page.getByRole('region', { name: 'Total' });
    await expect(summary).toBeInViewport();
    await expect(summary.getByRole('button', { name: 'Continue to payment' })).toBeInViewport();
    await expect(summary).toContainText('From $5.00/day');
  });

  test('a signed-out draft survives the trip to sign in', async ({ page }) => {
    await mockBuilder(page, { signedIn: false });
    await page.goto(`/advertise?listing_type=restaurant&listing_id=${RESTAURANT_ID}`);

    await page.getByRole('checkbox', { name: 'Top Banner' }).click();
    await page.getByRole('button', { name: 'Sign in to continue' }).click();

    await expect(page).toHaveURL(/\/auth\?redirect=/);
    const redirect = new URL(page.url()).searchParams.get('redirect');
    expect(redirect).toBe(`/advertise?listing_type=restaurant&listing_id=${RESTAURANT_ID}`);

    await page.goto('/advertise');
    await expect(page.getByRole('checkbox', { name: 'Top Banner' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Sponsored Listing' })).toBeChecked();
    await expect(page.locator('#linked-listing-name')).toHaveText(RESTAURANT_NAME);
  });
});
