import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * /search/advanced, Stage A of search plan WP4 (docs/page-plans/search.md).
 *
 * The page sold radius, price, time of day, features, deals and accessibility
 * filters that no query read, asked for the visitor's location on load and
 * never used it, had no query box, and crashed for any signed-in user whose
 * saved_searches held a row written by /events or the iOS app
 * (`filters.features.length` on a row with no `features`).
 *
 * Stage B turns the page into a redirect to /search once D2 (what Insider says
 * about search) is decided. When it lands, the assertions here are replaced by
 * "/search/advanced?q=jazz lands on /search?q=jazz", hence the file name.
 */

const USER_ID = '00000000-0000-4000-8000-000000000004';
const INSIDER_PLAN = {
  id: 'a0000000-0000-4000-8000-000000000002',
  name: 'insider',
  display_name: 'Insider',
  price_monthly: 4.99,
  price_yearly: 49,
  is_active: true,
  sort_order: 2,
  features: [],
  limits: {},
};

const REMOVED_CONTROLS = [
  /price range/i,
  /time of day/i,
  /accessibility/i,
  /near me/i,
  /has deals/i,
  /within \d+ miles/i,
];

/** The three shapes that share saved_searches, plus a null `filters`. */
const SAVED_ROWS = [
  {
    // Written by /events through create_event_saved_search.
    id: 'b0000000-0000-4000-8000-000000000001',
    name: 'Free jazz in WDM',
    filters: { q: 'jazz', category: 'music', location: 'west-des-moines', price: 'free' },
    search_type: 'event_list',
    created_at: '2026-09-20T12:00:00Z',
    last_used: null,
    use_count: 0,
  },
  {
    // Written by iOS for a non-Events tab: `advanced`, but not this page's shape.
    id: 'b0000000-0000-4000-8000-000000000002',
    name: 'iOS jazz',
    filters: { query: 'jazz', tab: 'places', alerts_enabled: true },
    search_type: 'advanced',
    created_at: '2026-09-21T12:00:00Z',
    last_used: null,
    use_count: 0,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    name: 'Empty row',
    filters: null,
    search_type: 'advanced',
    created_at: '2026-09-22T12:00:00Z',
    last_used: null,
    use_count: 0,
  },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** supabase-js keys the session by the first label of the BUILD-TIME Supabase host. */
function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** Counts geolocation calls, and dismisses the consent banner. */
function instrument(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    const geo = navigator.geolocation;
    if (geo) {
      const count = () => {
        w.__geoCalls += 1;
      };
      try {
        Object.defineProperty(geo, 'getCurrentPosition', { value: count, configurable: true });
        Object.defineProperty(geo, 'watchPosition', { value: () => { count(); return 0; }, configurable: true });
      } catch {
        /* the assertion will say so */
      }
    }
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
      );
    } catch {
      /* private mode */
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
          email: 'insider@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        /* private mode */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

async function signedInInsider(page: Page) {
  await seedSession(page);
  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/user')) {
      return json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'insider@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    }
    return json(route, {});
  });
  await page.route('**/functions/v1/**', (route) => json(route, {}));
  // Registered after installFixtureBackend, so these win; anything else falls
  // through to the fixtures.
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/subscription_plans')) return json(route, [INSIDER_PLAN]);
    if (url.includes('/user_subscriptions')) {
      return json(route, [{
        id: 'c0000000-0000-4000-8000-000000000004',
        user_id: USER_ID,
        plan_id: INSIDER_PLAN.id,
        status: 'active',
        platform: 'web',
        current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        cancel_at_period_end: false,
        plan: INSIDER_PLAN,
      }]);
    }
    if (url.includes('/profiles')) return json(route, [{ id: USER_ID, email: 'insider@example.com', role: 'user' }]);
    if (url.includes('/saved_searches')) return json(route, SAVED_ROWS);
    return route.fallback();
  });
}

test.describe('/search/advanced Stage A (search plan WP4)', () => {
  test('signed out: query box seeded from ?q=, honest gate, no location prompt', async ({ page }) => {
    await instrument(page);
    await installFixtureBackend(page);

    await page.goto('/search/advanced?q=jazz', { waitUntil: 'domcontentloaded' });

    const box = page.getByRole('searchbox', { name: 'Search' });
    await expect(box).toBeVisible({ timeout: 15_000 });
    await expect(box).toHaveValue('jazz');

    // The gate names only what a query applies.
    await expect(page.getByText(/minimum rating, area, event dates and featured picks/i)).toBeVisible();
    // Production builds strip data-testid (vite.config.ts), so this scopes by landmark.
    const sidebar = page.getByRole('complementary', { name: 'Search filters' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText(/distance/i)).toHaveCount(0);
    for (const control of REMOVED_CONTROLS) {
      await expect(sidebar.getByText(control), `removed control ${control} is back`).toHaveCount(0);
    }

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex, follow/);

    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  });

  test('signed out, no query: a prompt, not "No Results Found"', async ({ page }) => {
    await instrument(page);
    await installFixtureBackend(page);

    await page.goto('/search/advanced', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/start with a word or two/i)).toBeVisible();
    await expect(page.getByText(/no results found|nothing matched/i)).toHaveCount(0);
  });

  test('Insider with /events and iOS saved rows: no crash, only live controls', async ({ page }) => {
    await instrument(page);
    await installFixtureBackend(page);
    await signedInInsider(page);

    await page.goto('/search/advanced', { waitUntil: 'domcontentloaded' });

    const filters = page.getByRole('complementary', { name: 'Search filters' });
    // The Insider card, not the lock: the gate renders children only on access.
    await expect(filters.getByRole('heading', { name: 'Filters', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/something went wrong|this page encountered an error/i)).toHaveCount(0);
    await expect(filters.getByText('Area', { exact: true })).toBeVisible();
    await expect(filters.getByText('Minimum rating')).toBeVisible();
    await expect(filters.getByText('Event dates')).toBeVisible();
    await expect(filters.getByText('Featured only')).toBeVisible();
    for (const control of REMOVED_CONTROLS) {
      await expect(filters.getByText(control), `removed control ${control} is back`).toHaveCount(0);
    }

    // Every saved row renders, whatever wrote it.
    await expect(page.getByText('Free jazz in WDM')).toBeVisible();
    await expect(page.getByText('iOS jazz')).toBeVisible();
    await expect(page.getByText('Empty row')).toBeVisible();

    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);

    // A row this page can't load opens /search with its own words.
    await page
      .getByRole('list', { name: 'Saved searches' })
      .getByRole('listitem')
      .filter({ hasText: 'iOS jazz' })
      .getByRole('button', { name: 'Open' })
      .click();
    await page.waitForURL(/\/search\?q=jazz$/, { timeout: 15_000 });
  });
});
