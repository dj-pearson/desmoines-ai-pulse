import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The paywall (pricing plan WP4): UpgradeModal and PremiumGate.
 *
 * Mounted the way real visitors reach it: "Watch this search" on /search?q=jazz
 * opens the modal through useUpgradeModal, and the review prompt on a
 * restaurant page is a PremiumGate. Rows come from tests/support/fixtureBackend,
 * with the plan rows, subscription rows and analytics inserts answered here.
 *
 * The plan prices below are deliberately not the real ones, so a card that
 * shows them is reading the rows, not a constant in the component.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000d4';
const INSIDER_ID = 'a0000000-0000-4000-8000-0000000000b2';
const VIP_ID = 'a0000000-0000-4000-8000-0000000000b3';

const PLANS = [
  { id: 'a0000000-0000-4000-8000-0000000000b1', name: 'free', display_name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true, sort_order: 1, features: [], limits: { favorites: 3, alerts: 0, saved_searches: 0 } },
  { id: INSIDER_ID, name: 'insider', display_name: 'Insider', price_monthly: 5.49, price_yearly: 54.99, is_active: true, sort_order: 2, features: [], limits: { favorites: -1, alerts: 10, saved_searches: 10 } },
  { id: VIP_ID, name: 'vip', display_name: 'VIP', price_monthly: 11.49, price_yearly: 114.99, is_active: true, sort_order: 3, features: [], limits: { favorites: -1, alerts: -1, saved_searches: -1 } },
];

/** WP1's withdrawn list (plan-features-truthful.test.ts), matched case-insensitively. */
const WITHDRAWN = [
  'Early access',
  'early event access',
  'VIP perks',
  'Priority support',
  'Reservation assistance',
  'Exclusive VIP events',
  'Best value',
  'SMS alerts',
  'Monthly local business perks',
  'Daily personalized digest',
  '5 trips/month',
  'AI Trip Planner',
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** A signed-in session plus analytics consent, so paywall events are written. */
async function seedMember(page: Page) {
  await page.addInitScript(
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
          email: 'paywall@example.com',
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
        /* private mode */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/user')
      ? json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'paywall@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
      : json(route, {}),
  );
}

function insiderWebRow() {
  return {
    id: 'c0000000-0000-4000-8000-0000000000d1',
    user_id: USER_ID,
    plan_id: INSIDER_ID,
    status: 'active',
    platform: 'web',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
    plan: PLANS[1],
  };
}

/** Plan rows and the member's subscription rows. Registered after the fixture backend so they win. */
async function servePlans(page: Page, subscriptions: unknown[]) {
  await page.route('**/rest/v1/subscription_plans**', (route) => json(route, PLANS));
  await page.route('**/rest/v1/user_subscriptions**', (route) => json(route, subscriptions));
}

/** Records every paywall row the client inserts. */
async function recordAnalytics(page: Page): Promise<{ events: () => string[] }> {
  const events: string[] = [];
  await page.route('**/rest/v1/user_analytics**', (route) => {
    if (route.request().method() === 'POST') {
      try {
        const body = route.request().postDataJSON() as { event_type?: string } | Array<{ event_type?: string }>;
        for (const row of Array.isArray(body) ? body : [body]) {
          if (row.event_type) events.push(row.event_type);
        }
      } catch {
        /* not JSON */
      }
    }
    return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  return { events: () => events };
}

/** nlp-search answering with one event, so the watch button renders. */
async function stubSearch(page: Page) {
  await page.route('**/functions/v1/nlp-search**', (route) =>
    json(route, {
      success: true,
      query: 'jazz',
      parsedIntent: { contentTypes: ['events'], keywords: ['jazz'], confidence: 0.9, originalQuery: 'jazz' },
      results: {
        events: [
          {
            id: '40000000-0000-0000-0000-0000000000d1',
            title: 'Jazz on the River',
            date: '2026-10-02T00:00:00Z',
            event_start_utc: '2026-10-02T00:00:00Z',
            event_start_local: '2026-10-01T19:00:00',
            venue: 'Principal Riverwalk',
            price: 'Free',
          },
        ],
      },
      appliedFilters: [{ key: 'keywords', label: '"jazz"', types: ['events'] }],
      unappliedFilters: [],
      matchType: 'understood',
    }),
  );
}

const watchButton = (page: Page) => page.getByRole('button', { name: 'Watch this search' });

test.describe('Paywall (pricing plan WP4)', () => {
  test('a free member sees delivered benefits and prices from the plan rows', async ({ page }) => {
    await installFixtureBackend(page);
    await seedMember(page);
    await servePlans(page, []);
    await stubSearch(page);
    await recordAnalytics(page);

    await page.goto('/search?q=jazz');
    await expect(watchButton(page)).toBeEnabled({ timeout: 30_000 });
    await watchButton(page).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const plans = dialog.getByRole('radiogroup', { name: 'Choose a plan' });
    await expect(plans.getByRole('radio')).toHaveCount(2);
    await expect(plans.getByRole('radio', { checked: true })).toContainText('Insider');
    await expect(plans).toContainText('$5.49');
    await expect(plans).toContainText('$11.49');

    // The saved-search line takes its cap from the Insider row.
    await expect(dialog).toContainText('Saved searches and event alerts (up to 10)');

    await plans.getByRole('radio', { name: /VIP/ }).click();
    await expect(dialog).toContainText('Unlimited saved searches and alerts');

    const text = ((await dialog.textContent()) ?? '').toLowerCase();
    for (const phrase of WITHDRAWN) {
      expect(text, `the modal must not sell "${phrase}"`).not.toContain(phrase.toLowerCase());
    }

    await expect(dialog.getByRole('link', { name: 'Upgrade to VIP' })).toHaveAttribute(
      'href',
      '/pricing?plan=vip&billing=monthly',
    );
  });

  test('an Insider who hits the saved-search cap is offered VIP alone', async ({ page }) => {
    await installFixtureBackend(page);
    await seedMember(page);
    await servePlans(page, [insiderWebRow()]);
    await stubSearch(page);
    await recordAnalytics(page);
    await page.route('**/rest/v1/rpc/create_event_saved_search**', (route) =>
      json(route, { code: 'P0001', message: 'saved_search_limit_reached' }, 400),
    );

    await page.goto('/search?q=jazz');
    await expect(watchButton(page)).toBeEnabled({ timeout: 30_000 });
    await watchButton(page).click();
    await page.getByRole('button', { name: 'Email me new matches' }).click();

    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('radiogroup') });
    await expect(dialog).toBeVisible();
    const radios = dialog.getByRole('radiogroup', { name: 'Choose a plan' }).getByRole('radio');
    await expect(radios).toHaveCount(1);
    await expect(radios.first()).toContainText('VIP');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    await expect(dialog).toContainText('What VIP adds');

    // A web Insider changing tier goes through /subscription while in-place
    // changes are paused (billingStatus.ts), never to checkout.
    await expect(dialog).toContainText('Changing plans online is paused');
    await expect(dialog.getByRole('link', { name: 'Manage your plan' })).toHaveAttribute('href', '/subscription');
    await expect(dialog.getByRole('link', { name: /Upgrade to/ })).toHaveCount(0);
  });

  test('a parent re-render does not remount the open modal or log it twice', async ({ page }) => {
    await installFixtureBackend(page);
    await seedMember(page);
    await servePlans(page, []);
    await stubSearch(page);
    const analytics = await recordAnalytics(page);

    // Hold the saved-search list until the modal is open. When it lands, the
    // component that owns the modal re-renders, which used to hand React a new
    // component type and remount the dialog.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/rest/v1/saved_searches**', async (route) => {
      await held;
      return json(route, []);
    });

    await page.goto('/search?q=jazz');
    await expect(watchButton(page)).toBeEnabled({ timeout: 30_000 });
    await watchButton(page).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /VIP/ }).click();
    await expect.poll(() => analytics.events().filter((e) => e === 'paywall_present').length).toBe(1);

    const settled = page.waitForResponse('**/rest/v1/saved_searches**');
    release();
    await settled;
    await page.waitForTimeout(1_000);

    // Still open, still on the plan the reader picked, and logged once.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /VIP/ })).toHaveAttribute('aria-checked', 'true');
    expect(analytics.events().filter((e) => e === 'paywall_present')).toHaveLength(1);

    await dialog.getByRole('link', { name: 'Upgrade to VIP' }).click();
    await expect.poll(() => analytics.events()).toContain('paywall_cta_click');
    expect(analytics.events()).not.toContain('paywall_dismiss');
  });

  test('a failed plan read shows Retry in PremiumGate, not the paywall', async ({ page }) => {
    const restaurant = {
      id: '55555555-5555-4555-8555-5555555555d4',
      name: 'Paywall Fixture Grill',
      slug: 'paywall-fixture-grill',
      phone: '515-555-0100',
      website: 'https://example.com/grill',
      location: '400 Locust St, Des Moines, IA 50309',
      city: 'Des Moines',
      cuisine: 'American',
      description: 'A restaurant supplied by tests/paywall.spec.ts.',
      image_url: null,
      latitude: 41.58,
      longitude: -93.62,
      rating: 4.5,
      price_range: '$$',
      opening: 'Daily 11am-10pm',
      status: 'open',
      is_merged: false,
      merged_into: null,
      reservable: false,
      reservation_url: null,
      reservation_provider: null,
      updated_at: '2026-01-01T00:00:00Z',
    };

    await installFixtureBackend(page);
    await seedMember(page);
    await recordAnalytics(page);
    await page.route('**/rest/v1/restaurants*', (route) => {
      const url = decodeURIComponent(route.request().url());
      const hit = url.includes(`slug=eq.${restaurant.slug}`) || url.includes(`id=eq.${restaurant.id}`);
      return json(route, hit ? [restaurant] : []);
    });
    await page.route('**/rest/v1/subscription_plans**', (route) => json(route, PLANS));
    let failing = true;
    await page.route('**/rest/v1/user_subscriptions**', (route) =>
      failing ? json(route, { code: 'XX000', message: 'fixture outage' }, 500) : json(route, []),
    );

    await page.goto(`/restaurants/${restaurant.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: restaurant.name })).toBeVisible({ timeout: 30_000 });

    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Couldn't check your plan.")).toBeVisible();
    await expect(page.getByText(/upgrade to unlock/i)).toHaveCount(0);
    await expect(page.getByText('Write a Review')).toHaveCount(0);

    // Once the read works, a free member gets the ordinary prompt.
    failing = false;
    await retry.click();
    await expect(page.getByText('Write a Review')).toBeVisible({ timeout: 15_000 });
    await expect(retry).toHaveCount(0);
  });
});
