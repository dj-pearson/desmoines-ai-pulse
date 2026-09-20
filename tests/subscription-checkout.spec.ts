import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * WEB-CI-029 AC4. The paid path, end to end through the browser: a signed-in
 * reader on /pricing presses Go VIP, create-subscription-checkout is called
 * with the right plan, the app follows the URL it returns, and the success
 * screen resolves the new tier.
 *
 * WHY EVERYTHING IS ROUTE-MOCKED. This spec must never reach Stripe and must
 * never need a database: a smoke lane that depends on a live backend is a lane
 * that goes red for reasons no PR caused. Every Supabase call the page makes is
 * answered here, which also makes the assertions exact - "the function was
 * called once, with planId=<vip row's id>" is checkable, "a checkout probably
 * happened" is not.
 *
 * WHAT IT ACTUALLY PINS, none of which a Deno handler test can see:
 *   - the button on /pricing is wired to the function at all;
 *   - the local plan id ("vip") is resolved to the DATABASE row's id before
 *     the call, which is a join the UI does and the handler never sees;
 *   - startCheckout follows data.url rather than dropping it;
 *   - the success screen RE-READS entitlement after payment, so the tier a
 *     reader sees is the one they just bought.
 *
 * On that last point, measured rather than assumed: AC4 words it as
 * "refreshSubscription fires", and deleting that call from SubscriptionSuccess
 * does NOT fail this spec - the user-subscriptions query mounts fresh on that
 * route and fetches anyway. Two mechanisms produce the same outcome, so the
 * assertion is on the outcome (a read lands after the checkout, and the screen
 * names the new tier) rather than on which of them did it.
 * checkout-decision.test.ts covers the branch logic inside the function; this
 * covers the wiring around it, and the wiring is what broke last time.
 */

const USER_ID = '00000000-0000-4000-8000-000000000001';
const VIP_PLAN_ROW_ID = 'a0000000-0000-4000-8000-000000000003';

const PLANS = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'free', display_name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 1, features: [], limits: {}, stripe_price_id_monthly: null, stripe_price_id_yearly: null },
  { id: 'a0000000-0000-4000-8000-000000000002', name: 'insider', display_name: 'Insider', price_monthly: 4.99, price_yearly: 49, is_active: true, sort_order: 2, features: [], limits: {}, stripe_price_id_monthly: 'price_insider_monthly', stripe_price_id_yearly: 'price_insider_yearly' },
  { id: VIP_PLAN_ROW_ID, name: 'vip', display_name: 'VIP', price_monthly: 9.99, price_yearly: 99, is_active: true, sort_order: 3, features: [], limits: {}, stripe_price_id_monthly: 'price_vip_monthly', stripe_price_id_yearly: 'price_vip_yearly' },
];

function vipSubscriptionRow() {
  const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'c0000000-0000-4000-8000-000000000001',
    user_id: USER_ID,
    plan_id: VIP_PLAN_ROW_ID,
    status: 'active',
    platform: 'web',
    current_period_end: inAMonth,
    cancel_at_period_end: false,
    plan: PLANS[2],
  };
}

/**
 * supabase-js stores the session under `sb-<project-ref>-auth-token`, where the
 * ref is the first label of the Supabase host. That host is a BUILD-TIME value,
 * so this spec cannot hardcode it: locally the build uses a placeholder and in
 * CI the smoke lane builds with the real VITE_SUPABASE_URL secret. Deriving it
 * from the same variable the build read is what makes the seeded session
 * findable in both.
 */
function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** A session shaped the way supabase-js writes it, expiring well in the future. */
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
          email: 'vip-candidate@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        // The consent banner otherwise sits over the bottom of the page. The
        // shape and the version string come from CookieConsentBanner - a record
        // it does not recognise is treated as no consent at all.
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the test will fail on the assertions, not here */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('Paid path: /pricing -> checkout -> success (WEB-CI-029 AC4)', () => {
  test('Go VIP calls the checkout function and the success screen resolves the tier', async ({ page, baseURL }) => {
    await seedSession(page);

    // Entitlement flips only after checkout, which is what proves the success
    // screen re-read it rather than rendering a tier it already had.
    let paid = false;
    const checkoutCalls: Array<Record<string, unknown>> = [];
    let subscriptionReadsAfterCheckout = 0;

    await page.route('**/auth/v1/**', (route) => {
      const url = route.request().url();
      if (url.includes('/user')) {
        return json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'vip-candidate@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
      }
      return json(route, {});
    });


    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url();
      if (url.includes('/subscription_plans')) return json(route, PLANS);
      if (url.includes('/user_subscriptions')) {
        if (paid) subscriptionReadsAfterCheckout += 1;
        return json(route, paid ? [vipSubscriptionRow()] : []);
      }
      if (url.includes('/profiles')) return json(route, [{ id: USER_ID, email: 'vip-candidate@example.com', role: 'user' }]);
      return json(route, []);
    });

    // Everything else this app calls on boot (edge functions, analytics) gets an
    // empty answer rather than a network error, so a failure here is the paid
    // path failing and not the page's unrelated chatter. Registered BEFORE the
    // checkout handler on purpose: Playwright matches the most recently added
    // route first, so a catch-all added last swallows the specific one - which
    // is exactly how the first run of this spec failed, with the page reporting
    // "No checkout URL returned" from an empty {}.
    await page.route('**/functions/v1/**', (route) => json(route, {}));

    await page.route('**/functions/v1/create-subscription-checkout', async (route) => {
      checkoutCalls.push(JSON.parse(route.request().postData() || '{}'));
      paid = true;
      return json(route, { url: `${baseURL}/subscription/success?session_id=cs_test_webci029` });
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    const goVip = page.getByRole('button', { name: /go vip/i });
    await expect(goVip).toBeVisible({ timeout: 15_000 });
    await goVip.click();

    await page.waitForURL(/\/subscription\/success/, { timeout: 20_000 });

    expect(checkoutCalls, 'create-subscription-checkout should be called exactly once').toHaveLength(1);
    expect(checkoutCalls[0], 'the UI must send the database plan row id, not the local "vip" string')
      .toMatchObject({ planId: VIP_PLAN_ROW_ID, billingInterval: 'monthly' });

    // The success screen holds a 2s "Verifying your subscription..." state on
    // purpose, to let the webhook land, so this waits past it.
    await expect(page.getByRole('heading', { name: /welcome to vip/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/verifying your subscription/i)).toHaveCount(0);
    expect(subscriptionReadsAfterCheckout, 'entitlement must be re-read after payment, not served from cache')
      .toBeGreaterThan(0);
  });

  test('a signed-out reader is sent to auth instead of checkout', async ({ page }) => {
    const checkoutCalls: string[] = [];
    await page.route('**/functions/v1/create-subscription-checkout', (route) => {
      checkoutCalls.push(route.request().url());
      return json(route, { url: '/should-never-be-followed' });
    });
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url();
      if (url.includes('/subscription_plans')) return json(route, PLANS);
      return json(route, []);
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    const goVip = page.getByRole('button', { name: /go vip/i });
    await expect(goVip).toBeVisible({ timeout: 15_000 });
    await goVip.click();

    await page.waitForURL(/\/auth\?/, { timeout: 15_000 });
    expect(page.url()).toContain('plan=vip');
    expect(checkoutCalls, 'no checkout may be created for a signed-out reader').toHaveLength(0);
  });
});
