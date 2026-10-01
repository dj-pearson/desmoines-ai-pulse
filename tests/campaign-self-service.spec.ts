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
  const refundBodies: unknown[] = [];

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
    if (url.includes('/rpc/request_campaign_refund')) {
      rpcCalls.push(url);
      refundBodies.push(route.request().postDataJSON());
      return json(route, 'ticket-1');
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
  return { rpcCalls, refundBodies };
}

test.describe('campaign self-service (WEB-ADS-011)', () => {
  test('cancelling a draft calls the function and the row comes back cancelled', async ({ page }) => {
    const { rpcCalls } = await mockDashboard(page, 'draft', () => 'ok');
    await page.goto('/campaigns');

    await expect(page.getByText('Autumn Patio Push')).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();
    // Business WP2 item 6: the action runs from a confirmation dialog, not
    // from the first click.
    await expect.poll(() => rpcCalls.length).toBe(0);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel campaign' }).click();

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
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel campaign' }).click();
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
  test('a refund request needs a reason and says it is a request', async ({ page }) => {
    const { rpcCalls, refundBodies } = await mockDashboard(page, 'active', () => 'ok');
    await page.goto('/campaigns');

    await page.getByRole('button', { name: /request refund/i }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(/doesn't refund anything by itself/i)).toBeVisible();

    const send = dialog.getByRole('button', { name: 'Send request' });
    await dialog.getByRole('textbox').fill('too short');
    await expect(send).toBeDisabled();
    expect(rpcCalls.filter((u) => u.includes('request_campaign_refund'))).toHaveLength(0);

    await dialog.getByRole('textbox').fill('The banner ran on the wrong week.');
    await send.click();

    await expect.poll(() => refundBodies.length).toBe(1);
    expect(refundBodies[0]).toMatchObject({ p_reason: 'The banner ran on the wrong week.' });
  });

  test('a function that is not applied yet reads as a sentence, not a code', async ({ page }) => {
    await mockDashboard(page, 'draft', () => ({
      error: 'Could not find the function public.cancel_campaign(p_campaign_id) in the schema cache',
    }));
    await page.goto('/campaigns');

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel campaign' }).click();
    await expect(page.getByText(/isn't switched on yet/i)).toBeVisible();
    await expect(page.getByText(/schema cache/i)).toHaveCount(0);
  });
});

/**
 * Business WP2 item 12. The team page rendered every row blank (snake_case rows
 * cast to a camelCase interface) and told the owner an invitation had been
 * "sent" when nothing sends mail and nothing grants a member access.
 */
test.describe('campaign team page tells the truth', () => {
  test('a saved row shows its email and status, and nothing claims an email went out', async ({ page }) => {
    await seedSession(page);
    await page.route('**/auth/v1/**', (route) =>
      json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated',
        email: 'advertiser@example.com', app_metadata: {}, user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    );
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().url().includes('/campaign_team_members')) {
        return json(route, [
          {
            id: '55555555-0000-4000-8000-00000000a011',
            campaign_owner_id: USER_ID,
            team_member_email: 'colleague@example.com',
            team_member_id: null,
            role: 'editor',
            invitation_status: 'pending',
            invited_at: '2026-09-20T15:00:00Z',
            accepted_at: null,
            expires_at: '2026-09-27T15:00:00Z',
          },
        ]);
      }
      return json(route, []);
    });

    await page.goto('/campaigns/team');

    await expect(page.getByRole('cell', { name: 'colleague@example.com', exact: true })).toBeVisible();
    await expect(page.getByText('Not accepted')).toBeVisible();
    await expect(page.getByText('Editor', { exact: true })).toBeVisible();
    await expect(page.getByText(/team access isn't switched on yet/i)).toBeVisible();
    await expect(page.getByText(/\bsent\b/i)).toHaveCount(0);
  });
});
