import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP2: every way back into the site ends on the page the person
 * came from, says only what happened, and works once captcha is enforced.
 *
 * Everything is route-mocked. The smoke lane builds with placeholder
 * VITE_SUPABASE_* and must never need a backend, so GoTrue is answered here and
 * PostgREST by installFixtureBackend plus the handlers each test registers
 * after it (the last registered handler wins).
 */

const USER_ID = '00000000-0000-4000-8000-0000000000b2';
const EMAIL = 'returning@example.com';

/** Same derivation as submission-live-link.spec.ts: the key is a build-time value. */
function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * An unsigned token with the claims supabase-js reads locally. The assurance
 * level comes from `aal` here and from the user's verified factors, so a real
 * JWT shape is what lets the MFA branch be tested without a server.
 */
function fakeJwt(aal: 'aal1' | 'aal2'): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      sub: USER_ID,
      email: EMAIL,
      role: 'authenticated',
      aud: 'authenticated',
      aal,
      amr: [{ method: 'oauth', timestamp: now }],
      iat: now,
      exp: now + 3600,
    }),
    // Must itself be valid base64url; supabase-js checks all three parts.
    Buffer.from('unsigned').toString('base64url'),
  ].join('.');
}

interface UserShape {
  provider?: string;
  userMetadata?: Record<string, unknown>;
  verifiedTotp?: boolean;
}

function userObject({ provider = 'email', userMetadata = {}, verifiedTotp = false }: UserShape = {}) {
  const now = new Date().toISOString();
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL,
    email_confirmed_at: now,
    app_metadata: { provider, providers: [provider] },
    user_metadata: userMetadata,
    identities: [{ id: USER_ID, user_id: USER_ID, provider, identity_data: {}, created_at: now }],
    factors: verifiedTotp
      ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified', created_at: now, updated_at: now }]
      : [],
    created_at: now,
  };
}

function sessionObject(user: ReturnType<typeof userObject>) {
  return {
    access_token: fakeJwt('aal1'),
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

/** Consent already given, so the cookie banner does not sit over the form. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: true,
          analytics: true,
          advertising: true,
        }),
      );
    } catch {
      /* private mode - the assertions fail, not this */
    }
  });
}

/** Writes the session supabase-js will find on the next page load. */
async function storeSession(page: Page, session: unknown) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: authStorageKey(), value: session },
  );
}

async function seedSessionBeforeLoad(page: Page, session: unknown) {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* see acceptCookies */
      }
    },
    { key: authStorageKey(), value: session },
  );
}

/** GoTrue, answered for one user. Registered after installFixtureBackend. */
async function mockGoTrue(page: Page, user: ReturnType<typeof userObject>) {
  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return json(route, user);
    if (url.includes('/auth/v1/token')) return json(route, sessionObject(user));
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return json(route, {});
  });
  await page.route('**/functions/v1/check-login-attempt', (route) => json(route, { allowed: true }));
}

test.describe('the return path survives sign-in and sign-up', () => {
  test('signing in lands on the page, query string and all', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await mockGoTrue(page, userObject());

    await page.goto('/auth?redirect=%2Fevents%3Fq%3Djazz%2520night');
    await page.getByLabel('Email', { exact: true }).fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('Correct-horse-9');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/events\?q=jazz%20night$/);
  });

  test('a confirmed sign-up offers Continue back to where it started', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    const user = userObject();
    await mockGoTrue(page, user);
    // Confirmation required: GoTrue answers a sign-up with the user and no session.
    await page.route('**/auth/v1/signup**', (route) =>
      json(route, { ...user, email_confirmed_at: null, confirmation_sent_at: new Date().toISOString() }),
    );

    await page.goto('/auth?mode=signup&redirect=/restaurants/open-now');
    await page.getByLabel('Email', { exact: true }).fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('Correct-horse-9!');
    await page.getByLabel("I'm 13 or older").check();
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    const signup = page.waitForRequest((request) => request.url().includes('/auth/v1/signup'));
    await page.getByRole('button', { name: /create account/i }).click();
    await signup;

    // The confirmation link, opened in the same browser, after /auth/callback
    // has established the session.
    await storeSession(page, sessionObject(user));
    await page.goto('/auth/verified?confirmed=true');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/restaurants/open-now');
  });
});

test.describe('/auth/verified says only what happened', () => {
  test('a bare visit confirms nothing', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);

    await page.goto('/auth/verified');

    await expect(page.getByRole('heading', { level: 1, name: 'Nothing to confirm here' })).toBeVisible();
    await expect(page.getByText(/email verified/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
});

test.describe('/auth/callback', () => {
  test('an OAuth account with no terms on record finishes setting up, one consent row per answer', async ({
    page,
  }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    const user = userObject({ provider: 'google' });
    await seedSessionBeforeLoad(page, sessionObject(user));
    await mockGoTrue(page, user);

    const inserts: Array<Record<string, unknown>> = [];
    await page.route('**/rest/v1/consent_records**', (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown> | Array<Record<string, unknown>>;
        inserts.push(...(Array.isArray(body) ? body : [body]));
        return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
      }
      return json(route, []);
    });

    await page.goto('/auth/callback?redirect=%2Fevents');

    await expect(page.getByRole('heading', { level: 1, name: 'Finish setting up' })).toBeVisible();
    // The opt-ins start unticked.
    await expect(page.getByRole('checkbox', { name: /email me about/i })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /suggest events/i })).not.toBeChecked();

    // Required answers block Continue until given.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Agree to the terms to continue.')).toBeVisible();

    await page.getByRole('checkbox', { name: "I'm 13 or older" }).check();
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/events$/);
    expect(inserts.map((row) => row.consent_type).sort()).toEqual(['marketing_email', 'personalization_ai', 'terms']);
    const terms = inserts.find((row) => row.consent_type === 'terms');
    expect(terms?.granted).toBe(true);
    expect(terms?.user_id).toBe(USER_ID);
    expect((terms?.metadata as Record<string, unknown>)?.at_least_13).toBe(true);
    expect(inserts.find((row) => row.consent_type === 'marketing_email')?.granted).toBe(false);
  });

  test('a session that owes a second factor goes to /auth, not to a success screen', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    const user = userObject({ provider: 'google', verifiedTotp: true });
    await seedSessionBeforeLoad(page, sessionObject(user));
    await mockGoTrue(page, user);

    await page.goto('/auth/callback?redirect=%2Fevents');

    await expect(page).toHaveURL(/\/auth\?redirect=%2Fevents$/);
    await expect(page.getByText(/sign in successful/i)).toHaveCount(0);
  });

  test('a cancelled Google sign-in gets sign-in wording and Try again keeps the path', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);

    await page.goto('/auth/callback?redirect=%2Fevents&error=access_denied');

    await expect(page.getByRole('heading', { level: 1, name: "We couldn't sign you in" })).toBeVisible();
    await expect(page.getByText(/confirmation link/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/auth?redirect=%2Fevents');
  });
});

test.describe('/auth/reset-password', () => {
  test('Send again carries the captcha token when Turnstile is on', async ({ page }) => {
    let scriptRequested = false;
    await page.route('**/challenges.cloudflare.com/**', (route) => {
      scriptRequested = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.turnstile = {
          render: function (el, opts) { setTimeout(function () { opts.callback('stub-turnstile-token'); }, 0); return 'w1'; },
          reset: function () {},
          remove: function () {}
        };`,
      });
    });
    await acceptCookies(page);
    await installFixtureBackend(page);
    let recoverBody: Record<string, unknown> | null = null;
    await page.route('**/auth/v1/recover**', (route) => {
      recoverBody = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, {});
    });

    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The smoke build has no VITE_TURNSTILE_SITE_KEY, and without one the
    // widget is inert by design (turnstile-inert.spec.ts). Nothing to test.
    test.skip(!scriptRequested, 'VITE_TURNSTILE_SITE_KEY is not set in this build');

    await page.getByLabel('Email address', { exact: true }).fill(EMAIL);
    await page.getByRole('button', { name: 'Send again' }).click();

    await expect.poll(() => recoverBody).not.toBeNull();
    const security = (recoverBody as unknown as { gotrue_meta_security?: { captcha_token?: string } })
      .gotrue_meta_security;
    expect(security?.captcha_token).toBe('stub-turnstile-token');
  });

  test('a signed-in visitor without a recovery link is sent to Settings', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    const user = userObject();
    await seedSessionBeforeLoad(page, sessionObject(user));
    await mockGoTrue(page, user);

    await page.goto('/auth/reset-password');

    await expect(page).toHaveURL(/\/profile\?tab=settings#password$/);
  });
});
