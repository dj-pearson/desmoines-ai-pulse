import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Pricing plan WP3 items 1-3: /subscription/success says only what the
 * user_subscriptions row says.
 *
 * It used to sleep 2s and then announce "Your subscription is now active" with
 * an "Active" badge and eight benefits, whatever the row held. These pin the
 * replacement: a bounded poll (at most eleven reads in thirty seconds), a
 * processing state that never says "Active", a confirmed state that names the
 * row's own status, and a signed-out state.
 *
 * Route-mocked: installFixtureBackend answers what this spec is not about, and
 * the handlers registered after it (which win in Playwright) answer auth,
 * subscription_plans and user_subscriptions.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000e3';
const INSIDER_PLAN_ID = 'a0000000-0000-4000-8000-000000000002';

const PLANS = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'free', display_name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 1, features: [], limits: { favorites: 3, alerts: 0, saved_searches: 0 } },
  { id: INSIDER_PLAN_ID, name: 'insider', display_name: 'Insider', price_monthly: 4.99, price_yearly: 49.99, is_active: true, sort_order: 2, features: [], limits: { favorites: -1, alerts: 10, saved_searches: 10 } },
  { id: 'a0000000-0000-4000-8000-000000000003', name: 'vip', display_name: 'VIP', price_monthly: 12.99, price_yearly: 129.99, is_active: true, sort_order: 3, features: [], limits: { favorites: -1, alerts: -1, saved_searches: -1 } },
];

const TRIAL_END = '2026-12-02T15:00:00Z';

function trialingInsiderRow() {
  return {
    id: 'c0000000-0000-4000-8000-0000000000e3',
    user_id: USER_ID,
    plan_id: INSIDER_PLAN_ID,
    status: 'trialing',
    platform: 'web',
    current_period_start: '2026-11-25T15:00:00Z',
    current_period_end: TRIAL_END,
    trial_end: TRIAL_END,
    cancel_at_period_end: false,
    plan: PLANS[1],
  };
}

/** Phrases WEB-FEAT-016 withdrew; the old receipt listed most of them. */
const WITHDRAWN = [/early access/i, /priority support/i, /vip-only/i, /reservation/i, /concierge/i, /local business perks/i];

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

function seed(page: Page, signedIn: boolean) {
  return page.addInitScript(
    ({ userId, storageKey, consent, signedIn: withSession }) => {
      try {
        localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
        if (!withSession) return;
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: userId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'success@example.com',
              app_metadata: { provider: 'email' },
              user_metadata: {},
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey(), consent: CONSENT, signedIn },
  );
}

/**
 * Answers auth and the two subscription tables. `rows()` is read per request,
 * so a test can make the webhook "land" part-way through. Returns a counter of
 * user_subscriptions reads.
 */
async function routeSubscriptionBackend(page: Page, rows: () => unknown[]) {
  const reads = { userSubscriptions: 0 };
  await installFixtureBackend(page);
  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/user')) {
      return json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'success@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }
    return json(route, {});
  });
  await page.route('**/rest/v1/subscription_plans*', (route) => json(route, PLANS));
  await page.route('**/rest/v1/user_subscriptions*', (route) => {
    if (route.request().method() === 'GET') reads.userSubscriptions += 1;
    return json(route, rows());
  });
  return reads;
}

test.describe('/subscription/success (pricing plan WP3)', () => {
  test('no row for thirty seconds: processing state, never "Active", at most 11 reads', async ({ page }) => {
    test.setTimeout(75_000);
    await seed(page, true);
    const reads = await routeSubscriptionBackend(page, () => []);

    await page.goto('/subscription/success?session_id=cs_test_wp3_processing', { waitUntil: 'domcontentloaded' });
    const main = page.locator('#subscription-success');

    await expect(page.getByRole('heading', { level: 1, name: /confirming your plan/i })).toBeVisible({ timeout: 15_000 });
    await expect(main).not.toContainText(/\bactive\b/i);

    await expect(page.getByRole('heading', { level: 1, name: /your plan is activating/i })).toBeVisible({ timeout: 30_000 });
    await expect(main).not.toContainText(/\bactive\b/i);
    await expect(main.getByRole('link', { name: /go to your subscription/i })).toHaveAttribute('href', '/subscription');
    await expect(main.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', '/contact');

    // Let the rest of the thirty seconds run out: the poll must have stopped.
    await page.waitForTimeout(8_000);
    expect(reads.userSubscriptions, 'the poll is bounded').toBeGreaterThan(1);
    expect(reads.userSubscriptions, 'at most eleven user_subscriptions reads in thirty seconds').toBeLessThanOrEqual(11);
    await expect(main).not.toContainText(/\bactive\b/i);

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('the row lands mid-poll: confirmed as a trial with real benefits', async ({ page }) => {
    await seed(page, true);
    const landsAt = Date.now() + 3_000;
    const reads = await routeSubscriptionBackend(page, () => (Date.now() >= landsAt ? [trialingInsiderRow()] : []));

    await page.goto('/subscription/success?session_id=cs_test_wp3_confirmed', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /welcome to insider/i })).toBeVisible({ timeout: 20_000 });
    const main = page.locator('#subscription-success');
    await expect(main.getByText('Trial', { exact: true })).toBeVisible();
    await expect(main).toContainText(/trial ends december 2, 2026/i);
    // A trialing row is a trial, not "Active".
    await expect(main).not.toContainText(/\bactive\b/i);
    await expect(main).toContainText(/unlimited favorites/i);
    for (const phrase of WITHDRAWN) await expect(main).not.toContainText(phrase);

    // Confirmed stops the poll.
    const settled = reads.userSubscriptions;
    await page.waitForTimeout(5_000);
    expect(reads.userSubscriptions - settled, 'no reads after confirmation').toBeLessThanOrEqual(1);
  });

  test('signed out: asks to sign in and reads nothing', async ({ page }) => {
    await seed(page, false);
    const reads = await routeSubscriptionBackend(page, () => [trialingInsiderRow()]);

    await page.goto('/subscription/success?session_id=cs_test_wp3_signed_out', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /sign in to see your plan/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#subscription-success').getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      `/auth?redirect=${encodeURIComponent('/subscription')}`,
    );
    await expect(page.locator('#subscription-success')).not.toContainText(/welcome to/i);
    expect(reads.userSubscriptions).toBe(0);
  });
});
