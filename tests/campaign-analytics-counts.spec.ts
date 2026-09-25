import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Business plan WP2 items 10 and 11. Campaign analytics count on the server.
 *
 * The old hook downloaded ad_impressions rows and took `.length`. PostgREST
 * caps a response at 1000 rows, so a campaign that served 5,000 impressions
 * reported 1,000: an under-count of the one thing the advertiser paid for,
 * and nothing failed. The totals now come from a HEAD request with
 * `count=exact`, read from Content-Range. This spec answers that HEAD with
 * `0-999/5000` - the header a capped response carries - and asserts the page
 * prints 5,000, not the number of rows it happened to receive.
 *
 * It also pins what the page no longer invents: a daily cost, a cost per
 * click, "unique viewers" from session ids.
 */

const USER_ID = '00000000-0000-4000-8000-0000000b2a01';
const CAMPAIGN_ID = '44444444-0000-4000-8000-0000000b2a01';

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
        /* private mode */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const CORS = { 'access-control-allow-origin': '*' };

const json = (route: Route, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, ...extra }, body: JSON.stringify(body) });

const CAMPAIGN = {
  id: CAMPAIGN_ID,
  user_id: USER_ID,
  name: 'Ingersoll Patio Season',
  status: 'active',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  total_cost: 450,
  rejected_reason: null,
  renewal_eligible: false,
  created_at: '2026-08-20T15:00:00Z',
  campaign_placements: [{ id: 'p1', placement_type: 'top_banner', days_count: 30, daily_cost: 15, total_cost: 450 }],
  campaign_creatives: [],
};

async function setup(page: Page) {
  await seedSession(page);
  await installFixtureBackend(page);
  await page.route('**/auth/v1/**', (route) =>
    json(route, {
      id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'advertiser@example.com',
      app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z',
    }),
  );
  await page.route('**/rest/v1/campaigns**', (route) => {
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
    return json(route, wantsObject ? CAMPAIGN : [CAMPAIGN]);
  });
  await page.route('**/rest/v1/campaign_creatives**', (route) => json(route, []));

  const seriesRequests: string[] = [];
  const answerEvents = (total: number) => (route: Route) => {
    if (route.request().method() === 'HEAD') {
      // What a capped response carries: the first 1000 rows of `total`.
      return route.fulfill({
        status: 206,
        headers: { ...CORS, 'access-control-expose-headers': 'content-range', 'content-range': `0-999/${total}` },
        body: '',
      });
    }
    seriesRequests.push(route.request().url());
    return json(route, [{ date: '2026-09-02' }, { date: '2026-09-02' }, { date: '2026-09-03' }]);
  };
  await page.route('**/rest/v1/ad_impressions**', answerEvents(5000));
  await page.route('**/rest/v1/ad_clicks**', answerEvents(42));
  return { seriesRequests };
}

test.describe('campaign analytics counts (business WP2)', () => {
  test('totals come from the exact count, not from the rows received', async ({ page }) => {
    const { seriesRequests } = await setup(page);
    await page.goto(`/campaigns/${CAMPAIGN_ID}/analytics`);

    await expect(page.getByRole('heading', { level: 1, name: 'Ingersoll Patio Season' })).toBeVisible();
    const stats = page.locator('dl').first();
    await expect(stats.getByText('5,000', { exact: true })).toBeVisible();
    await expect(stats.getByText('42', { exact: true })).toBeVisible();

    // The series reads dates only; session ids no longer leave the database.
    expect(seriesRequests.length).toBeGreaterThan(0);
    for (const url of seriesRequests) {
      expect(url).not.toContain('session_id');
    }
  });

  test('no invented cost figures, and the counting rules are on the page', async ({ page }) => {
    await setup(page);
    await page.goto(`/campaigns/${CAMPAIGN_ID}/analytics`);

    await expect(page.getByText('5,000', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/daily cost/i)).toHaveCount(0);
    await expect(page.getByText(/cost\s*\/\s*click|cost per click/i)).toHaveCount(0);
    await expect(page.getByText(/unique viewers/i)).toHaveCount(0);

    await expect(page.getByText('Amount paid', { exact: true })).toBeVisible();
    await expect(page.getByText('$450.00').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we count' })).toBeVisible();
    await expect(page.getByText(/half of your ad has been on screen for one second/i)).toBeVisible();
  });
});
