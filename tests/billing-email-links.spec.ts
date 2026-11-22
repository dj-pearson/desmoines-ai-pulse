import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-LEGAL-016: where a billing email lands.
 *
 * Trial, dunning and upgrade emails linked /profile?tab=settings, which had
 * no plan, payment or cancel control: "Cancel before you are charged" opened
 * security settings. New mail links /subscription (see
 * supabase/functions/_tests/billing-links.test.ts). Mail already sent cannot
 * be recalled, so the old link has to show the way to the subscription too,
 * and the subscription page has to be reachable from the account menu
 * without an email at all.
 *
 * Route-mocked like account-settings.spec.ts: installFixtureBackend answers
 * the rest, and the handlers registered after it win.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000e7';
const EMAIL = 'member@example.com';

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-11-01T14:05:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  factors: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-11-01T14:05:00Z',
};

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** An unsigned JWT with the claims supabase-js decodes locally. Every request is mocked. */
function accessToken(): string {
  const b64url = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: EMAIL,
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: now - 600 }],
      session_id: '66666666-0000-4000-8000-0000000000e7',
      iat: now - 600,
      exp: now + 3600,
    }),
    'c2lnbmF0dXJl',
  ].join('.');
}

const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

async function signIn(page: Page) {
  await installFixtureBackend(page);
  await page.addInitScript(
    ({ storageKey, user, token }) => {
      const session = {
        access_token: token,
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { storageKey: authStorageKey(), user: USER, token: accessToken() },
  );

  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return json(route, USER);
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers, body: '' });
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const wantsObject = (request.headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (request.method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...headers, 'content-range': '*/0' }, body: '' });
    }
    if (url.includes('/rest/v1/profiles')) {
      const row = {
        id: '77777777-0000-4000-8000-0000000000e7',
        user_id: USER_ID,
        email: EMAIL,
        first_name: 'Morgan',
        last_name: 'Member',
        phone: null,
        location: null,
        interests: [],
        communication_preferences: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      return json(route, wantsObject ? row : [row]);
    }
    for (const table of ['user_email_preferences', 'weekly_digest_log', 'consent_records', 'user_subscriptions']) {
      if (url.includes(`/rest/v1/${table}`)) return json(route, wantsObject ? null : []);
    }
    return route.fallback();
  });
}

test.describe('billing email links (WEB-LEGAL-016)', () => {
  test('the old /profile?tab=settings link shows the way to the subscription page', async ({ page }) => {
    await signIn(page);
    await page.goto('/profile?tab=settings');

    const card = page.getByRole('heading', { name: 'Subscription and billing' });
    await expect(card).toBeVisible();
    // It is the first thing in the tab, above every security panel, so a
    // reader who came to cancel does not have to scroll to find it.
    await expect(card).toBeInViewport();

    const manage = page.getByRole('link', { name: 'Manage subscription' });
    await expect(manage).toHaveAttribute('href', '/subscription');
    await manage.click();
    await expect(page).toHaveURL(/\/subscription$/);
    await expect(page.getByText(/page not found/i)).toHaveCount(0);
  });

  test('the desktop account menu has a Subscription entry', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto('/profile');

    await page.getByRole('button', { name: /^Account menu for/ }).click();
    const item = page.getByRole('menuitem', { name: 'Go to subscription page' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('href', '/subscription');
  });

  test('the mobile menu has a Subscription entry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const link = page.getByRole('link', { name: 'Go to subscription page' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/subscription');
  });
});
