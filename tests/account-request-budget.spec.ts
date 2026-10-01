import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP3 item 11. What a signed-in /dashboard overview asks the
 * backend for before and just after first paint.
 *
 * Before WP3 the overview mounted useFavorites (which pulls in
 * useGamification's six-way fetch: user_badges, community_challenges and
 * friends), useCampaigns (every campaign with its placements, for a tab most
 * people never open), and ProtectedRoute's usePermission (a second read of
 * user_roles and profiles that AuthContext had already made). None of that is
 * on the overview now, and this spec keeps it off.
 *
 * `campaigns` is allowed ONE kind of request: the count-only HEAD behind the
 * "Action needed" line (useCampaignActionCount). The full campaign list, a GET,
 * belongs to the Advertise tab.
 *
 * BUDGET is measured, not guessed. On 2026-09-25 the overview made 18
 * /rest/v1 requests with every table answering 200 (so no retries):
 *
 *   user_roles, rpc/sync_oauth_user_role, profiles x2 (AuthContext, Header's
 *   useProfile), rpc/get_user_session_policy, user_sessions,
 *   subscription_plans, user_subscriptions, user_reputation, event_attendance,
 *   user_event_interactions, user_event_reminders, user_submitted_events,
 *   HEAD campaigns, HEAD user_event_interactions, HEAD content_favorites,
 *   recently_viewed, rpc/user_analytics
 *
 * Two of those, user_sessions and get_user_session_policy, come from
 * useSessionTimeout, which account plan WP5 item 8 gates to admins; until that
 * lands the user_sessions assertion below fails, and that is the point of it.
 * The cap is the measured 18 plus two for requests that can legitimately race
 * in. Raise it only with the request log in the PR that needs it.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000c4';
const BUDGET = 20;
const NEVER_ON_OVERVIEW = ['user_sessions', 'user_badges', 'community_challenges'];

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
          email: 'budget@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
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

const headers = (extra: Record<string, string> = {}) => ({
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range',
  ...extra,
});

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: headers(), body: JSON.stringify(body) });

interface Logged {
  method: string;
  table: string;
}

test('signed-in /dashboard overview stays inside its request budget', async ({ page }) => {
  const log: Logged[] = [];

  await installFixtureBackend(page);
  await seedSession(page);

  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/user')) {
      return json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'budget@example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    return json(route, {});
  });

  // Registered last so it sees every REST request first; it only answers the
  // single-row reads that need an object and hands the rest back.
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    const table = /\/rest\/v1\/(?:rpc\/)?([a-z0-9_]+)/i.exec(request.url())?.[1] ?? 'other';
    log.push({ method: request.method(), table });

    if (request.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: headers({ 'content-range': '*/0' }), body: '' });
    }
    const wantsObject = (request.headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (table === 'profiles') {
      const profile = { id: USER_ID, user_id: USER_ID, email: 'budget@example.com', interests: ['music'] };
      return json(route, wantsObject ? profile : [profile]);
    }
    if (wantsObject) return route.fallback();
    if (['event_attendance', 'user_event_interactions', 'user_event_reminders', 'user_submitted_events', 'user_roles', 'user_subscriptions', 'subscription_plans', 'user_reputation'].includes(table)) {
      return json(route, []);
    }
    return route.fallback();
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Nothing planned this week')).toBeVisible({ timeout: 20_000 });
  // Let anything scheduled after first paint (idle callbacks, deferred reads) land.
  await page.waitForTimeout(3_000);

  const summary = log.map((r) => `${r.method} ${r.table}`).join('\n');

  for (const table of NEVER_ON_OVERVIEW) {
    expect(log.filter((r) => r.table === table), `${table} was requested:\n${summary}`).toHaveLength(0);
  }
  expect(
    log.filter((r) => r.table === 'campaigns' && r.method !== 'HEAD'),
    `the campaign list was fetched on the overview:\n${summary}`,
  ).toHaveLength(0);
  expect(log.length, `REST requests on /dashboard overview:\n${summary}`).toBeLessThanOrEqual(BUDGET);
});
