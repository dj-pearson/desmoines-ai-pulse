import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * WEB-ADS-011 AC5. Cancelling a draft campaign from the dashboard.
 *
 * WHAT THIS PINS THAT A SQL TEST CANNOT. campaign-self-service.test.mjs reads
 * the rules out of the migration; what it cannot see is whether the button
 * exists, whether it is wired to the function, and whether an advertiser is
 * told when the server refuses. Those three are the whole of AC2 from the
 * advertiser's side, and all three were missing: CampaignDashboard rendered
 * Upload / View / Analytics and nothing else, so someone who changed their
 * mind had no button at all.
 *
 * The refusal case is the one worth having. cancel_campaign raises for a paid
 * campaign - deliberately, because a paid campaign cancelled with one click is
 * a refund with no record of what was owed - and a UI that swallows that leaves
 * an advertiser pressing a dead button.
 *
 * Everything is route-mocked: the smoke lane builds with placeholder
 * VITE_SUPABASE_* and must never need a backend.
 */

const USER_ID = '00000000-0000-4000-8000-00000000a011';
const DRAFT_ID = '11111111-0000-4000-8000-00000000a011';
const RENEWED_ID = '22222222-0000-4000-8000-00000000a011';

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
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the test fails on the assertions, not here */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

function campaign(status: string, renewalEligible = false) {
  return {
    renewal_eligible: renewalEligible,
    id: DRAFT_ID,
    user_id: USER_ID,
    name: 'Autumn Patio Push',
    status,
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    total_cost: 420,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    campaign_placements: [],
    campaign_creatives: [],
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

/**
 * `onCancel` decides what the RPC answers. Returning 'ok' flips the list to
 * cancelled on the next read, which is what proves the page re-read rather
 * than rendering a status it invented.
 */
async function mockDashboard(
  page: Page,
  startingStatus: string,
  onCancel: () => 'ok' | { error: string },
  renewalEligible = false,
) {
  await seedSession(page);
  let status = startingStatus;
  const rpcCalls: string[] = [];

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

  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/cancel_campaign')) {
      rpcCalls.push(url);
      const result = onCancel();
      if (result === 'ok') {
        status = 'cancelled';
        return json(route, 'cancelled');
      }
      return json(route, { code: 'P0001', message: result.error }, 400);
    }
    if (url.includes('/rpc/renew_campaign')) {
      rpcCalls.push(url);
      return json(route, RENEWED_ID);
    }
    if (url.includes('/campaigns')) return json(route, [campaign(status, renewalEligible)]);
    if (url.includes('/profiles')) return json(route, [{ id: USER_ID, email: 'advertiser@example.com' }]);
    return json(route, []);
  });

  await page.route('**/functions/v1/**', (route) => json(route, {}));
  return { rpcCalls };
}

test.describe('campaign self-service (WEB-ADS-011)', () => {
  test('cancelling a draft calls the function and the row comes back cancelled', async ({ page }) => {
    const { rpcCalls } = await mockDashboard(page, 'draft', () => 'ok');
    await page.goto('/campaigns');

    await expect(page.getByText('Autumn Patio Push')).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();

    // The server did it, not the page.
    await expect.poll(() => rpcCalls.length).toBeGreaterThan(0);
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });

  test('a refusal from the server is shown, not swallowed', async ({ page }) => {
    // An active campaign has no Cancel button at all, so the refusal path is
    // reached by the server refusing a request the page thought was allowed -
    // which is exactly the case a client-side status check cannot cover.
    await mockDashboard(page, 'draft', () => ({
      error: 'cancel_campaign: a active campaign cannot be cancelled here',
    }));
    await page.goto('/campaigns');

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByText(/cannot be cancelled here/i)).toBeVisible();
  });

  test('renewing a campaign in its window opens the new draft', async ({ page }) => {
    // renewal_eligible is set by the lifecycle job seven days before the end,
    // so this button exists while there is still time to renew without a gap.
    // The clone is a DRAFT that has to be paid for - the page must take the
    // advertiser to it rather than implying the renewal is already running.
    const { rpcCalls } = await mockDashboard(page, 'active', () => 'ok', true);
    await page.goto('/campaigns');

    await page.getByRole('button', { name: /renew/i }).click();

    await expect.poll(() => rpcCalls.filter((u) => u.includes('renew_campaign')).length)
      .toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`/campaigns/${RENEWED_ID}$`));
  });

  test('a campaign outside its renewal window offers no Renew', async ({ page }) => {
    await mockDashboard(page, 'active', () => 'ok', false);
    await page.goto('/campaigns');

    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /renew/i })).toHaveCount(0);
  });

  test('an active campaign offers pause, not cancel', async ({ page }) => {
    await mockDashboard(page, 'active', () => 'ok');
    await page.goto('/campaigns');

    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    // Cancelling a paid campaign is a refund question, and the button that
    // pretends otherwise is the one this story is about not shipping.
    await expect(page.getByRole('button', { name: /^cancel$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /request refund/i })).toBeVisible();
  });
});
