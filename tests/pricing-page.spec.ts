import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Pricing plan WP2: /pricing states the offer, shows a price on the first
 * screen, sells only what ships, says why a checkout failed, never runs a
 * one-click plan change, and carries the visitor's choice through sign-in.
 *
 * Route-mocked end to end, like subscription-checkout.spec.ts: no request
 * reaches Stripe or a database. installFixtureBackend answers what this spec
 * is not about; the handlers registered after it answer subscription_plans,
 * user_subscriptions, auth and create-subscription-checkout (Playwright gives
 * the most recently registered handler the match).
 */

const USER_ID = '00000000-0000-4000-8000-0000000000d2';
const INSIDER_ROW_ID = 'a0000000-0000-4000-8000-000000000002';

const PLANS = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'free', display_name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 1, features: [], limits: { favorites: 3, alerts: 0, saved_searches: 0 }, stripe_price_id_monthly: null, stripe_price_id_yearly: null },
  { id: INSIDER_ROW_ID, name: 'insider', display_name: 'Insider', price_monthly: 4.99, price_yearly: 49.99, is_active: true, sort_order: 2, features: [], limits: { favorites: -1, alerts: 10, saved_searches: 10 }, stripe_price_id_monthly: 'price_insider_monthly', stripe_price_id_yearly: 'price_insider_yearly' },
  { id: 'a0000000-0000-4000-8000-000000000003', name: 'vip', display_name: 'VIP', price_monthly: 12.99, price_yearly: 129.99, is_active: true, sort_order: 3, features: [], limits: { favorites: -1, alerts: -1, saved_searches: -1 }, stripe_price_id_monthly: 'price_vip_monthly', stripe_price_id_yearly: 'price_vip_yearly' },
];

function insiderWebRow() {
  return {
    id: 'c0000000-0000-4000-8000-0000000000d2',
    user_id: USER_ID,
    plan_id: INSIDER_ROW_ID,
    status: 'active',
    platform: 'web',
    current_period_start: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    current_period_end: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
    plan: PLANS[1],
  };
}

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

/** Consent only, so the banner doesn't cover the cards. No session. */
function seedConsent(page: Page) {
  return page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode - the assertions fail, not this */
    }
  }, CONSENT);
}

function seedSession(page: Page) {
  return page.addInitScript(
    ({ userId, storageKey, consent }) => {
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
          email: 'pricing@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey(), consent: CONSENT },
  );
}

const headers = (extra: Record<string, string> = {}) => ({
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range',
  ...extra,
});

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: headers(), body: JSON.stringify(body) });

/** A count-only HEAD answer: no body, the total on Content-Range. */
const headCount = (route: Route, total: number) =>
  route.fulfill({ status: 200, headers: headers({ 'content-range': total > 0 ? `0-${total - 1}/${total}` : '*/0' }), body: '' });

interface Backend {
  signedIn?: boolean;
  subscriptions?: unknown[];
  /** create-subscription-checkout's answer. Default: a 200 with a URL. */
  checkout?: { status: number; body: unknown };
}

async function mockPricing(page: Page, backend: Backend = {}) {
  const checkoutCalls: unknown[] = [];
  await installFixtureBackend(page);
  if (backend.signedIn) await seedSession(page);
  else await seedConsent(page);

  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/factors')) return json(route, { all: [], totp: [], phone: [] });
    if (url.includes('/user')) {
      return json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'pricing@example.com',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      });
    }
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    const isHead = route.request().method() === 'HEAD';
    if (url.includes('/subscription_plans')) return json(route, PLANS);
    if (url.includes('/user_subscriptions')) {
      if (isHead) return headCount(route, 0);
      return json(route, backend.subscriptions ?? []);
    }
    if (isHead) return headCount(route, 1);
    return route.fallback();
  });

  await page.route('**/functions/v1/create-subscription-checkout', (route) => {
    checkoutCalls.push(route.request().postDataJSON());
    const answer = backend.checkout ?? { status: 200, body: { url: 'about:blank' } };
    return json(route, answer.body, answer.status);
  });

  return { checkoutCalls };
}

test.describe('/pricing (pricing plan WP2)', () => {
  test.describe('on a phone, light theme', () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });

    test('the H1 is visible against its background and a price is on the first screen', async ({ page }) => {
      await mockPricing(page);
      await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toBeVisible({ timeout: 15_000 });
      await expect(h1).toContainText(/Insider/);

      const { color, background } = await h1.evaluate((el) => {
        const colorOf = getComputedStyle(el).color;
        let node: Element | null = el;
        let bg = 'rgba(0, 0, 0, 0)';
        while (node) {
          const c = getComputedStyle(node).backgroundColor;
          if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) {
            bg = c;
            break;
          }
          node = node.parentElement;
        }
        return { color: colorOf, background: bg };
      });
      expect(color, 'index.html paints h1 white; the page must override it').not.toBe(background);

      const price = page.getByText(/Insider \$4\.99\/mo/).first();
      await expect(price).toBeVisible();
      const box = await price.boundingBox();
      expect(box, 'the hero price line must render').not.toBeNull();
      expect(box!.y + box!.height, 'a dollar figure must be inside the first 844px').toBeLessThanOrEqual(844);
    });
  });

  test('signed out: nothing reads "Current plan" and Free offers a free account', async ({ page }) => {
    await mockPricing(page);
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: 'Create free account' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /current plan/i })).toHaveCount(0);
    await expect(page.getByText(/current plan/i)).toHaveCount(0);
  });

  test('the page sells nothing withdrawn or paused', async ({ page }) => {
    await mockPricing(page);
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /go vip/i })).toBeVisible({ timeout: 15_000 });

    // The whole page, footer included: the footer's site-wide "View Plans"
    // band is an upsell too, and it sold early event access until the
    // integration pass.
    const whole = (await page.locator('body').innerText()).toLowerCase();
    for (const phrase of ['best value', 'early event access', 'early access', 'vip perks']) {
      expect(whole, `"${phrase}" must not be on /pricing`).not.toContain(phrase);
    }
    const text = (await page.locator('#pricing-content').innerText()).toLowerCase();
    for (const phrase of ['ai trip planner', 'thousands']) {
      expect(text, `"${phrase}" must not be on /pricing`).not.toContain(phrase);
    }
    // src/lib/tripPlannerStatus.ts has AI_PLANNER_AVAILABLE = false, so no
    // tier may list trip plans at all.
    expect(text).not.toContain('trip plans');
  });

  test('a 403 email_verification_required is shown with a resend action on the first click', async ({ page }) => {
    const { checkoutCalls } = await mockPricing(page, {
      signedIn: true,
      checkout: {
        status: 403,
        body: { error: 'Please verify your email address before subscribing.', code: 'email_verification_required' },
      },
    });
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    const goVip = page.getByRole('button', { name: /go vip/i });
    await expect(goVip).toBeEnabled({ timeout: 15_000 });
    await goVip.click();

    await expect(page.getByText('Verify your email first', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Please verify your email address before subscribing.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /resend email/i })).toBeVisible();
    expect(checkoutCalls).toHaveLength(1);
  });

  test('an Insider with a web subscription clicking VIP gets the paused dialog and no checkout call', async ({ page }) => {
    const { checkoutCalls } = await mockPricing(page, { signedIn: true, subscriptions: [insiderWebRow()] });
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /current plan/i })).toBeVisible({ timeout: 15_000 });
    const change = page.getByRole('button', { name: 'Change plan' });
    await expect(change).toBeEnabled();
    await change.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Changing plans online is paused');
    await expect(dialog.getByRole('link', { name: /your subscription/i })).toHaveAttribute('href', '/subscription');
    expect(checkoutCalls, 'a paused plan change must never reach create-subscription-checkout').toHaveLength(0);
  });

  test('?plan=vip&billing=yearly preselects yearly, focuses VIP, and survives the sign-in redirect', async ({ page }) => {
    const { checkoutCalls } = await mockPricing(page);
    await page.goto('/pricing?plan=vip&billing=yearly', { waitUntil: 'domcontentloaded' });

    const goVip = page.getByRole('button', { name: /go vip/i });
    await expect(goVip).toBeFocused({ timeout: 15_000 });
    await expect(page.getByRole('radiogroup', { name: 'Billing period' }).getByRole('radio', { name: 'Yearly' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('$129.99').first()).toBeVisible();

    await goVip.click();
    await page.waitForURL(/\/auth\?/, { timeout: 15_000 });
    const redirect = new URL(page.url()).searchParams.get('redirect');
    expect(redirect).not.toBeNull();
    const back = new URL(redirect!, 'http://localhost');
    expect(back.pathname).toBe('/pricing');
    expect(back.searchParams.get('plan')).toBe('vip');
    expect(back.searchParams.get('billing')).toBe('yearly');
    expect(checkoutCalls).toHaveLength(0);
  });

  test('a cancelled checkout toasts once and the flag leaves the URL', async ({ page }) => {
    await mockPricing(page);
    await page.goto('/pricing?canceled=true', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Checkout cancelled', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.has('canceled')).toBe(false);
  });
});
