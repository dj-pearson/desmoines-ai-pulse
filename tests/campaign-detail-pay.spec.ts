import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Business plan WP2 item 1. A campaign that wasn't paid for can be paid for
 * from its own page.
 *
 * Before this, createCheckoutSession had one caller - /advertise, straight
 * after creating a draft - so an advertiser who closed Stripe, or renewed, or
 * followed "Complete payment" from the dashboard landed on a page with no way
 * to pay. The button prints the stored server amount and hands checkout the
 * campaign id; the server reprices and refuses (409) anything else, which the
 * page shows as the new total.
 *
 * Route-mocked: the smoke lane builds with placeholder VITE_SUPABASE_*.
 */

const USER_ID = '00000000-0000-4000-8000-0000000b2001';
const CAMPAIGN_ID = '33333333-0000-4000-8000-0000000b2001';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_wp2';

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
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
          email_confirmed_at: '2026-09-01T00:00:00Z',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: '2026-09-01T00:00:00Z',
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const CORS = { 'access-control-allow-origin': '*' };

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

function pendingCampaign() {
  return {
    id: CAMPAIGN_ID,
    user_id: USER_ID,
    name: 'Riverfront Brunch Push',
    status: 'pending_payment',
    start_date: '2026-10-01',
    end_date: '2026-10-30',
    total_cost: 66.5,
    rejected_reason: null,
    renewal_eligible: false,
    created_at: '2026-09-20T15:00:00Z',
    updated_at: '2026-09-20T15:00:00Z',
    campaign_placements: [
      { id: 'p1', placement_type: 'featured_spot', days_count: 30, daily_cost: 2.22, total_cost: 66.5 },
    ],
    campaign_creatives: [],
  };
}

/** Answer campaigns reads with one row, as an object or an array depending on what was asked for. */
async function routeCampaigns(page: Page, answer: (route: Route) => Promise<void> | void) {
  await page.route('**/rest/v1/campaigns**', (route) => answer(route));
}

function answerRow(route: Route, row: unknown) {
  const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
  return json(route, wantsObject ? row : [row]);
}

async function setup(page: Page) {
  await seedSession(page);
  await installFixtureBackend(page);
  await page.route('**/auth/v1/**', (route) =>
    json(route, {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'advertiser@example.com',
      email_confirmed_at: '2026-09-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-01T00:00:00Z',
    }),
  );
}

test.describe('pay for a saved campaign (business WP2)', () => {
  test('a pending_payment campaign shows the stored amount and starts checkout with its id', async ({ page }) => {
    await setup(page);
    await routeCampaigns(page, (route) => answerRow(route, pendingCampaign()));

    const checkoutBodies: unknown[] = [];
    await page.route('**/functions/v1/create-campaign-checkout', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*' } });
      checkoutBodies.push(route.request().postDataJSON());
      return json(route, { url: CHECKOUT_URL });
    });
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stripe</body></html>' }),
    );

    await page.goto(`/campaigns/${CAMPAIGN_ID}`);

    const pay = page.getByRole('button', { name: 'Pay $66.50' });
    await expect(pay).toBeVisible();
    await pay.click();

    await expect.poll(() => checkoutBodies.length).toBeGreaterThan(0);
    expect(checkoutBodies[0]).toMatchObject({ campaignId: CAMPAIGN_ID });
    await expect(page).toHaveURL(CHECKOUT_URL);
  });

  test('a 409 from checkout shows the new total instead of a generic failure', async ({ page }) => {
    await setup(page);
    await routeCampaigns(page, (route) => answerRow(route, pendingCampaign()));
    await page.route('**/functions/v1/create-campaign-checkout', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*' } });
      return json(
        route,
        { error: 'PRICE_CHANGED', message: 'The price changed.', storedTotal: 66.5, currentTotal: 70 },
        409,
      );
    });

    await page.goto(`/campaigns/${CAMPAIGN_ID}`);
    await page.getByRole('button', { name: 'Pay $66.50' }).click();

    await expect(page.getByText('$70.00').first()).toBeVisible();
    // Still on our page: nothing was charged at a price the buyer hadn't seen.
    await expect(page).toHaveURL(new RegExp(`/campaigns/${CAMPAIGN_ID}$`));
  });

  test('a campaign that fails to load shows an error, not "not found"', async ({ page }) => {
    await setup(page);
    await routeCampaigns(page, (route) => json(route, { code: '42501', message: 'permission denied' }, 403));

    await page.goto(`/campaigns/${CAMPAIGN_ID}`);

    await expect(page.getByText("This campaign didn't load")).toBeVisible();
    await expect(page.getByText(/campaign not found/i)).toHaveCount(0);
  });

  test('the dashboard shows an error, not "No campaigns yet", when the list fails', async ({ page }) => {
    await setup(page);
    await routeCampaigns(page, (route) => json(route, { code: '42501', message: 'permission denied' }, 403));

    await page.goto('/campaigns');

    await expect(page.getByText("Your campaigns didn't load")).toBeVisible();
    await expect(page.getByText('No campaigns yet')).toHaveCount(0);
  });

  test('the detail page has no Team Access button while team access grants nothing', async ({ page }) => {
    await setup(page);
    await routeCampaigns(page, (route) => answerRow(route, pendingCampaign()));

    await page.goto(`/campaigns/${CAMPAIGN_ID}`);
    await expect(page.getByRole('button', { name: /Pay \$66\.50/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /team access/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /team access/i })).toHaveCount(0);
    // October 1 in Des Moines, not September 30 from a UTC parse.
    await expect(page.getByText('October 1, 2026')).toBeVisible();
    await expect(page.getByText('30', { exact: true })).toBeVisible();
  });
});
