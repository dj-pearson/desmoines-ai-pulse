import { test, expect, type Page, type Route, type Request } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP5: /profile?tab=settings, where every control does what its
 * label says.
 *
 * Route-mocked end to end, the way account-home.spec.ts does it:
 * installFixtureBackend answers everything this spec is not about, and the
 * handlers registered after it (Playwright gives the last one the match) answer
 * auth, profiles, the email tables and the deletion function. route.fallback()
 * hands anything else back to the fixture backend.
 *
 * The session is aal2: its access token carries `aal: "aal2"` and the user has
 * a verified TOTP factor. That is the case the old password form broke - it
 * re-signed-in with signInWithPassword (a POST to /auth/v1/token), got an aal1
 * session back, and AuthContext's WEB-SEC-026 hold then treated the user as
 * signed out halfway through changing their password.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000d5';
const EMAIL = 'careful@example.com';
const FACTOR = {
  id: '44444444-0000-4000-8000-0000000000d5',
  friendly_name: 'Work phone',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-09-24T14:05:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [
    {
      id: USER_ID,
      identity_id: '55555555-0000-4000-8000-0000000000d5',
      user_id: USER_ID,
      provider: 'email',
      identity_data: { email: EMAIL, sub: USER_ID },
      created_at: '2026-01-01T00:00:00Z',
      last_sign_in_at: '2026-09-24T14:05:00Z',
      updated_at: '2026-09-24T14:05:00Z',
    },
  ],
  factors: [FACTOR],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-24T14:05:00Z',
};

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** An unsigned JWT with the claims supabase-js decodes locally. Nothing verifies it: every request is mocked. */
function aal2AccessToken(): string {
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
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: now - 600 },
        { method: 'totp', timestamp: now - 590 },
      ],
      session_id: '66666666-0000-4000-8000-0000000000d5',
      iat: now - 600,
      exp: now + 3600,
    }),
    'c2lnbmF0dXJl',
  ].join('.');
}

function seedSession(page: Page) {
  return page.addInitScript(
    ({ storageKey, user, accessToken }) => {
      const session = {
        access_token: accessToken,
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
    { storageKey: authStorageKey(), user: USER, accessToken: aal2AccessToken() },
  );
}

const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

interface Backend {
  deletion?: Record<string, unknown>;
}

/** Every request the page made, for the "never asked for" assertions. */
async function mockAccount(page: Page, backend: Backend = {}): Promise<Request[]> {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));

  await installFixtureBackend(page);
  await seedSession(page);

  await page.route('**/auth/v1/**', (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/v1/token')) {
      // The old form's signInWithPassword. Answered with an error so a
      // regression fails loudly here as well as in the request assertion.
      return json(route, { error: 'invalid_grant', error_description: 'not in this test' }, 400);
    }
    if (url.includes('/auth/v1/reauthenticate')) return json(route, {});
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers, body: '' });
    if (url.includes('/auth/v1/user')) return json(route, USER);
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
        id: '77777777-0000-4000-8000-0000000000d5',
        user_id: USER_ID,
        email: 'old-address@example.com',
        first_name: 'Casey',
        last_name: 'Careful',
        phone: null,
        location: null,
        interests: ['music'],
        communication_preferences: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      return json(route, wantsObject ? row : [row]);
    }
    for (const table of ['user_email_preferences', 'weekly_digest_log', 'consent_records']) {
      if (url.includes(`/rest/v1/${table}`)) return json(route, []);
    }
    return route.fallback();
  });

  await page.route('**/functions/v1/delete-user-account', async (route) => {
    let body: { action?: string } = {};
    try {
      body = (route.request().postDataJSON() as { action?: string }) ?? {};
    } catch {
      body = {};
    }
    if (body.action === 'request') {
      return json(route, {
        success: true,
        confirmation_token: 'fixture-token',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    }
    return json(route, backend.deletion ?? { success: true, complete: true });
  });

  return requests;
}

async function openSettings(page: Page) {
  await page.goto('/profile?tab=settings');
  await expect(page.getByRole('heading', { name: 'Security checkup' })).toBeVisible();
  await expect(page.getByText('Your consent history')).toBeVisible();
}

test.describe('account settings (account plan WP5)', () => {
  test('an aal2 session changes its password with an emailed code and stays signed in', async ({ page }) => {
    const requests = await mockAccount(page);
    await openSettings(page);

    await page.getByLabel('New password').fill('Porch-Concert-2026');
    await page.getByLabel('Type it again').fill('Porch-Concert-2026');
    await page.getByRole('button', { name: 'Email me a code' }).click();

    await page.getByLabel('Code from the email').fill('123456');
    const update = page.waitForRequest(
      (r) => r.url().includes('/auth/v1/user') && r.method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Change password' }).click();

    const sent = (await update).postDataJSON() as { password?: string; nonce?: string };
    expect(sent).toMatchObject({ password: 'Porch-Concert-2026', nonce: '123456' });

    await expect(page.getByText('Password changed').first()).toBeVisible();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('heading', { name: 'Security checkup' })).toBeVisible();

    const reauth = requests.filter((r) => r.url().includes('/auth/v1/reauthenticate'));
    expect(reauth.length).toBeGreaterThan(0);
    const tokenCalls = requests.filter((r) => r.url().includes('/auth/v1/token'));
    expect(tokenCalls.map((r) => r.url())).toEqual([]);
  });

  test('settings never asks for tables production does not have, and shows no error toast', async ({ page }) => {
    const requests = await mockAccount(page);
    await openSettings(page);
    // Let the lazy panels settle.
    await page.waitForTimeout(1500);

    const dead = requests
      .map((r) => r.url())
      .filter((url) => /user_sessions|revoke_session|revoke_all_other_sessions|get_user_session_policy/.test(url));
    expect(dead).toEqual([]);

    await expect(page.locator('.destructive.group')).toHaveCount(0);
    await expect(page.getByText('Failed to Load Sessions')).toHaveCount(0);
  });

  test('a null preference bag and no digest row render every opt-in off', async ({ page }) => {
    await mockAccount(page);
    await openSettings(page);

    await expect(page.getByRole('switch', { name: 'Weekly event digest' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Account and activity emails' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Personalized suggestions' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(/not sent to you yet/i)).toBeVisible();
  });

  test('no invented claims anywhere under /profile', async ({ page }) => {
    await mockAccount(page);
    const banned = /AI-Powered|Sunday at 8|backup codes|Events Attended|Reviews Written|work will be saved/i;

    for (const path of ['/profile', '/profile?tab=activity', '/profile?tab=settings']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
      if (path.endsWith('settings')) {
        await expect(page.getByText('Your consent history')).toBeVisible();
      }
      // The page's own <main>, not <body>: the site footer's newsletter blurb
      // (not this plan's file) says "AI-powered", which is not a claim this
      // page makes.
      expect(await page.locator('main main').innerText(), path).not.toMatch(banned);
    }

    // The account email comes from the auth user, not the stale profiles.email.
    await page.goto('/profile');
    await expect(page.getByText(EMAIL).first()).toBeVisible();
    await expect(page.getByText('old-address@example.com')).toHaveCount(0);
  });

  test('a partial deletion never claims the data was permanently deleted', async ({ page }) => {
    await mockAccount(page, {
      deletion: { success: true, complete: false, tables_incomplete: ['event_reviews'], store_subscriptions_still_active: [] },
    });
    await openSettings(page);

    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/this confirmation works until/i)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm deletion' }).click();

    await expect(page.getByText(/still being removed/i).first()).toBeVisible();
    await expect(page.getByText(/permanently deleted/i)).toHaveCount(0);
  });

  test('moved tabs redirect', async ({ page }) => {
    await mockAccount(page);
    await page.goto('/profile?tab=favorites');
    await expect(page).toHaveURL(/\/my-events\?tab=saved/);
  });
});
