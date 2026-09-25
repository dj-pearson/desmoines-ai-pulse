import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Pricing plan WP3 items 4-11: /subscription shows the state Stripe holds, in
 * words that match the row.
 *
 * What these pin:
 *   - Stripe controls and dates come from the WEB row (manage-subscription
 *     `details`), not from the highest tier on any platform;
 *   - one status sentence per state, with the amount from Stripe's upcoming
 *     invoice and a destructive alert for past_due;
 *   - Cancel updates the page without a reload;
 *   - the page reads no table that doesn't exist (payments, invoices,
 *     get_user_payment_summary), and a free member is sent to /pricing
 *     rather than into a checkout from here.
 *
 * Route-mocked: installFixtureBackend answers the rest; the handlers
 * registered after it win.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000f3';
const INSIDER_PLAN_ID = 'a0000000-0000-4000-8000-000000000002';
const VIP_PLAN_ID = 'a0000000-0000-4000-8000-000000000003';

const PLANS = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'free', display_name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 1, features: [], limits: { favorites: 3, alerts: 0, saved_searches: 0 } },
  { id: INSIDER_PLAN_ID, name: 'insider', display_name: 'Insider', price_monthly: 4.99, price_yearly: 49.99, is_active: true, sort_order: 2, features: [], limits: { favorites: -1, alerts: 10, saved_searches: 10 } },
  { id: VIP_PLAN_ID, name: 'vip', display_name: 'VIP', price_monthly: 12.99, price_yearly: 129.99, is_active: true, sort_order: 3, features: [], limits: { favorites: -1, alerts: -1, saved_searches: -1 } },
];

// Fixed, distinct dates so an assertion can tell which row a date came from.
const WEB_PERIOD_START = '2026-10-25T12:00:00Z';
const WEB_PERIOD_END = '2026-11-25T12:00:00Z';
const IOS_PERIOD_END = '2027-01-14T12:00:00Z';
const TRIAL_END = '2026-10-02T12:00:00Z';

interface WebRowOptions {
  status?: 'active' | 'trialing' | 'past_due';
  cancelAtPeriodEnd?: boolean;
  plan?: (typeof PLANS)[number];
}

function webRow({ status = 'active', cancelAtPeriodEnd = false, plan = PLANS[1] }: WebRowOptions = {}) {
  return {
    id: 'c0000000-0000-4000-8000-0000000000f1',
    user_id: USER_ID,
    plan_id: plan.id,
    status,
    platform: 'web',
    current_period_start: WEB_PERIOD_START,
    current_period_end: status === 'trialing' ? TRIAL_END : WEB_PERIOD_END,
    trial_end: status === 'trialing' ? TRIAL_END : null,
    cancel_at_period_end: cancelAtPeriodEnd,
    plan,
  };
}

function iosVipRow() {
  return {
    id: 'c0000000-0000-4000-8000-0000000000f2',
    user_id: USER_ID,
    plan_id: VIP_PLAN_ID,
    status: 'active',
    platform: 'ios',
    // iOS rows carry no current_period_start.
    current_period_start: null,
    current_period_end: IOS_PERIOD_END,
    cancel_at_period_end: false,
    plan: PLANS[2],
  };
}

type Row = ReturnType<typeof webRow> | ReturnType<typeof iosVipRow>;

/** manage-subscription `details`, shaped as index.ts builds it. */
function detailsFor(rows: Row[], upcoming: number | null) {
  const web = rows.find((r) => r.platform === 'web') ?? null;
  const store = rows.find((r) => r.platform !== 'web') ?? null;
  const primary = web ?? store;
  if (!primary) {
    return { subscription: null, tier: 'free', hasActiveSubscription: false, manageAt: null, manageUrl: null, platforms: [] };
  }
  return {
    subscription: {
      id: primary.id,
      status: primary.status,
      plan: primary.plan,
      platform: primary.platform,
      currentPeriodStart: primary.current_period_start,
      currentPeriodEnd: primary.current_period_end,
      cancelAtPeriodEnd: primary.cancel_at_period_end,
      trialEnd: 'trial_end' in primary ? primary.trial_end : null,
    },
    tier: rows.some((r) => r.plan.name === 'vip') ? 'vip' : primary.plan.name,
    hasActiveSubscription: true,
    manageAt: web ? null : 'appstore',
    manageUrl: web ? null : 'https://apps.apple.com/account/subscriptions',
    platforms: rows.map((r) => ({
      platform: r.platform,
      tier: r.plan.name,
      status: r.status,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      manageAt: r.platform === 'ios' ? 'appstore' : null,
    })),
    payments: [],
    upcomingInvoice: web && upcoming !== null ? { amount: upcoming, currency: 'usd', dueDate: null } : null,
  };
}

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

function seedSession(page: Page) {
  return page.addInitScript(
    ({ userId, storageKey, consent }) => {
      try {
        localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
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
              email: 'portal@example.com',
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
    { userId: USER_ID, storageKey: authStorageKey(), consent: CONSENT },
  );
}

interface PortalBackend {
  /** Requests to tables or RPCs that don't exist in production. */
  missingRelationRequests: string[];
  functionActions: string[];
  checkoutCalls: number;
}

/**
 * `state.rows` is read per request, so a cancel can change what the next
 * details read answers, the way the real function's local write does.
 */
async function routePortalBackend(page: Page, state: { rows: Row[]; upcoming: number | null }): Promise<PortalBackend> {
  const backend: PortalBackend = { missingRelationRequests: [], functionActions: [], checkoutCalls: 0 };

  page.on('request', (request) => {
    const url = request.url();
    if (/\/rest\/v1\/(payments|invoices)\b|\/rpc\/get_user_payment_summary\b|generate-invoice-pdf/.test(url)) {
      backend.missingRelationRequests.push(url);
    }
  });

  await installFixtureBackend(page);
  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/user')) {
      return json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'portal@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    }
    return json(route, {});
  });
  await page.route('**/rest/v1/subscription_plans*', (route) => json(route, PLANS));
  await page.route('**/rest/v1/user_subscriptions*', (route) => json(route, state.rows));
  await page.route('**/functions/v1/create-subscription-checkout', (route) => {
    backend.checkoutCalls += 1;
    return json(route, { url: '/should-never-be-followed' });
  });
  await page.route('**/functions/v1/manage-subscription', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 204, headers: CORS });
    const action = (JSON.parse(route.request().postData() || '{}') as { action?: string }).action ?? 'details';
    backend.functionActions.push(action);
    if (action === 'cancel') {
      state.rows = state.rows.map((r) => (r.platform === 'web' ? { ...r, cancel_at_period_end: true } : r));
      return json(route, { success: true, message: 'Subscription will be canceled at period end', cancel_at: WEB_PERIOD_END });
    }
    if (action === 'resume') {
      state.rows = state.rows.map((r) => (r.platform === 'web' ? { ...r, cancel_at_period_end: false } : r));
      return json(route, { success: true, message: 'Subscription has been resumed' });
    }
    return json(route, detailsFor(state.rows, state.upcoming));
  });
  return backend;
}

const portal = (page: Page) => page.locator('#subscription-portal');

test.describe('/subscription (pricing plan WP3)', () => {
  test('web Insider plus iOS VIP: Stripe controls and dates come from the web row', async ({ page }) => {
    await seedSession(page);
    const backend = await routePortalBackend(page, { rows: [webRow(), iosVipRow()], upcoming: 4.99 });

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /subscription and billing/i })).toBeVisible({ timeout: 20_000 });
    const root = portal(page);
    // Entitled tier names the plan; the web row drives everything Stripe.
    await expect(root.getByRole('heading', { level: 2, name: 'VIP' })).toBeVisible();
    await expect(root).toContainText('Billed by Stripe');
    await expect(root).toContainText(/Stripe bills your Insider plan/);
    await expect(root.getByText('Renews November 25, 2026 for $4.99.', { exact: true })).toBeVisible();
    // The iOS row's date appears once, on its own line in the breakdown, and
    // nowhere in the plan card or its dialogs.
    await expect(root.getByText(/January 14, 2027/)).toHaveCount(1);
    await root.getByRole('button', { name: /cancel subscription/i }).click();
    await expect(page.getByRole('alertdialog')).toContainText(/until November 25, 2026/);
    await page.getByRole('button', { name: /keep subscription/i }).click();
    // The per-platform breakdown lists both rows.
    await expect(root.getByText('Apple App Store')).toBeVisible();

    expect(backend.missingRelationRequests, 'no reads of tables that do not exist').toEqual([]);
  });

  test('Cancel flips the badge and the button without a reload', async ({ page }) => {
    await seedSession(page);
    const state = { rows: [webRow()] as Row[], upcoming: 4.99 };
    const backend = await routePortalBackend(page, state);

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });
    const root = portal(page);
    await expect(root.getByRole('button', { name: /cancel subscription/i })).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    await root.getByRole('button', { name: /cancel subscription/i }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(/until November 25, 2026/);
    await dialog.getByRole('button', { name: /yes, cancel/i }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(root.getByText('Canceling')).toBeVisible();
    await expect(root.getByRole('button', { name: /resume subscription/i })).toBeVisible();
    await expect(root.getByText("Ends November 25, 2026. You won't be charged again.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    expect(backend.functionActions).toContain('cancel');
  });

  test('a failed cancel keeps the dialog open and shows the server message', async ({ page }) => {
    await seedSession(page);
    await routePortalBackend(page, { rows: [webRow()], upcoming: 4.99 });
    // Registered last, so it wins over the stateful handler for cancel.
    await page.route('**/functions/v1/manage-subscription', async (route) => {
      const action = (JSON.parse(route.request().postData() || '{}') as { action?: string }).action;
      if (action === 'cancel') return json(route, { error: 'Stripe is unavailable. Try again shortly.' }, 503);
      return route.fallback();
    });

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });
    const root = portal(page);
    await root.getByRole('button', { name: /cancel subscription/i }).click({ timeout: 20_000 });
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /yes, cancel/i }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Stripe is unavailable. Try again shortly.');
    await expect(dialog).toBeVisible();
    await expect(root.getByText('Canceling')).toHaveCount(0);
  });

  test('trialing says when the trial ends and what follows', async ({ page }) => {
    await seedSession(page);
    await routePortalBackend(page, { rows: [webRow({ status: 'trialing' })], upcoming: 4.99 });

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });
    const root = portal(page);
    await expect(root.getByText('Trial ends October 2, 2026, then $4.99.')).toBeVisible({ timeout: 20_000 });
    await expect(root.getByText('Trial', { exact: true })).toBeVisible();
  });

  test('past_due shows the payment-failed alert with the payment action', async ({ page }) => {
    await seedSession(page);
    await routePortalBackend(page, { rows: [webRow({ status: 'past_due' })], upcoming: 4.99 });

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });
    const alert = portal(page).getByRole('alert').filter({ hasText: 'Payment failed' });
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert.getByRole('button', { name: /manage payment method/i })).toBeVisible();
  });

  test('free member: plans link to /pricing, no checkout from here, no missing tables', async ({ page }) => {
    await seedSession(page);
    const backend = await routePortalBackend(page, { rows: [], upcoming: null });

    await page.goto('/subscription', { waitUntil: 'domcontentloaded' });
    const root = portal(page);
    await expect(root.getByRole('heading', { level: 2, name: 'Free' })).toBeVisible({ timeout: 20_000 });
    await expect(root.getByRole('link', { name: /see insider/i })).toHaveAttribute('href', '/pricing?plan=insider');
    await expect(root.getByRole('link', { name: /see vip/i })).toHaveAttribute('href', '/pricing?plan=vip');
    await expect(root).not.toContainText(/early access/i);
    await expect(root.getByRole('tab')).toHaveCount(0);

    expect(backend.checkoutCalls).toBe(0);
    expect(backend.missingRelationRequests).toEqual([]);
  });
});
