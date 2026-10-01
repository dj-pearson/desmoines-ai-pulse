import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP1: /auth lets real people in.
 *
 * Four things this page got wrong, each asserted at the network or the DOM
 * rather than in a comment:
 *
 *   1. exec@firm.com was rejected before the request left the browser, because
 *      validateEmail ran an SQL-keyword check that matched EXEC. The test is
 *      that the token endpoint SEES the address.
 *   2. A correct two-factor code signed the person out: the dialog's success
 *      path called onCancel, which /auth wires to logout(). The test is that
 *      /auth/v1/logout is never requested and the page moves on.
 *   3. Sign-up was about twenty controls. /auth?mode=signup now opens on four,
 *      with Google above them.
 *   4. After a lockout the button stayed disabled until a reload. It now counts
 *      down the server's lockoutSeconds and comes back by itself.
 *
 * Everything is route-mocked. The smoke lane builds with placeholder
 * VITE_SUPABASE_*, so no real GoTrue is reachable, and none is needed: these
 * are assertions about what the page sends and renders.
 */

const USER_ID = '00000000-0000-4000-8000-00000000a0f1';
const FACTOR_ID = '00000000-0000-4000-8000-00000000fac1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
};

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** An unsigned JWT with the claims supabase-js reads locally (aal, exp, sub). */
function jwt(aal: 'aal1' | 'aal2'): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'twofactor@example.com',
      aal,
      amr: aal === 'aal2' ? [{ method: 'password', timestamp: now }, { method: 'totp', timestamp: now }] : [{ method: 'password', timestamp: now }],
      session_id: '00000000-0000-4000-8000-000000005e55',
      iat: now,
      exp: now + 3600,
    }),
    'test-signature',
  ].join('.');
}

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'twofactor@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  factors: [
    {
      id: FACTOR_ID,
      friendly_name: 'Authenticator App',
      factor_type: 'totp',
      status: 'verified',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function session(aal: 'aal1' | 'aal2') {
  return {
    access_token: jwt(aal),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${aal}`,
    user: USER,
  };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });
}

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: false, advertising: false }),
      );
    } catch {
      /* private mode - the assertions fail, not this */
    }
  });
}

test.describe('/auth sign-in and sign-up funnel', () => {
  test('exec@firm.com reaches the token endpoint', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await page.route('**/functions/v1/check-login-attempt', (route) => json(route, 200, { allowed: true, attemptsRemaining: 5 }));

    const tokenBodies: string[] = [];
    await page.route('**/auth/v1/token**', (route) => {
      tokenBodies.push(route.request().postData() ?? '');
      return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    });

    await page.goto('/auth');
    await page.getByLabel(/email/i).fill('exec@firm.com');
    await page.getByLabel(/password/i).and(page.locator('input')).fill('Correct-horse-9');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect.poll(() => tokenBodies.length).toBeGreaterThan(0);
    expect(JSON.parse(tokenBodies[0]).email).toBe('exec@firm.com');
    await expect(page.getByText(/check your email address/i)).toHaveCount(0);
  });

  test('a correct two-factor code keeps you signed in', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await page.route('**/functions/v1/check-login-attempt', (route) => json(route, 200, { allowed: true, attemptsRemaining: 5 }));

    let verified = false;
    const logoutCalls: string[] = [];
    await page.route('**/auth/v1/token**', (route) => json(route, 200, session('aal1')));
    await page.route('**/auth/v1/user**', (route) => json(route, 200, USER));
    await page.route('**/auth/v1/logout**', (route) => {
      logoutCalls.push(route.request().url());
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    });
    await page.route(`**/auth/v1/factors/${FACTOR_ID}/challenge`, (route) =>
      json(route, 200, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 }),
    );
    await page.route(`**/auth/v1/factors/${FACTOR_ID}/verify`, (route) => {
      verified = true;
      return json(route, 200, session('aal2'));
    });

    await page.goto('/auth?redirect=%2Fevents');
    await page.getByLabel(/email/i).fill('twofactor@example.com');
    await page.getByLabel(/password/i).and(page.locator('input')).fill('Correct-horse-9');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Code').fill('123456');

    await expect.poll(() => verified).toBe(true);
    await expect(page).toHaveURL(/\/events(\?|$)/, { timeout: 15_000 });
    await expect(page.getByText(/sign-in cancelled/i)).toHaveCount(0);
    expect(logoutCalls, 'a correct code must not sign the person out').toEqual([]);
  });

  test('/auth?mode=signup opens on four fields with Google above them', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await page.goto('/auth?mode=signup');

    await expect(page.getByRole('tab', { name: /create account/i })).toHaveAttribute('aria-selected', 'true');

    const panel = page.getByRole('tabpanel');
    // Chromium exposes a password input as a textbox too, so four fields is
    // two textboxes (email, password) and two checkboxes.
    const textboxes = panel.getByRole('textbox').filter({ visible: true });
    const email = panel.getByRole('textbox', { name: 'Email' });
    const password = panel.locator('input[type="password"]').filter({ visible: true });
    const checkboxes = panel.getByRole('checkbox').filter({ visible: true });

    await expect(textboxes).toHaveCount(2);
    await expect(email).toHaveCount(1);
    await expect(password).toHaveCount(1);
    await expect(checkboxes).toHaveCount(2);
    await expect(checkboxes.nth(0)).toHaveAccessibleName(/13 or older/i);
    await expect(checkboxes.nth(1)).toHaveAccessibleName(/terms of service/i);

    const google = page.getByRole('button', { name: /continue with google/i });
    await expect(google).toBeVisible();
    const googleBox = await google.boundingBox();
    const emailBox = await email.boundingBox();
    expect(googleBox && emailBox && googleBox.y < emailBox.y, 'Google sits above the form').toBe(true);

    // The controls that are gone: account type, business fields, location, SMS.
    await expect(page.getByText(/account type/i)).toHaveCount(0);
    await expect(page.getByLabel(/business name|business type/i)).toHaveCount(0);
    await expect(page.getByLabel(/location/i)).toHaveCount(0);
    await expect(page.getByText(/sms|text message/i)).toHaveCount(0);

    // Submit stays enabled; a missing tick is reported on the checkbox.
    const submit = page.getByRole('button', { name: /^create account$/i });
    await expect(submit).toBeEnabled();
    await email.fill('new.person@example.com');
    await password.fill('Correct-horse-9');
    await submit.click();
    await expect(checkboxes.nth(1)).toHaveAttribute('aria-invalid', 'true');
  });

  test('the sign-in button comes back when the server lockout ends', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);

    const LOCK_SECONDS = 3;
    let failures = 0;
    let lockedUntil = 0;
    await page.route('**/auth/v1/token**', (route) => {
      failures += 1;
      if (failures === 5) lockedUntil = Date.now() + LOCK_SECONDS * 1000;
      return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    });
    await page.route('**/functions/v1/check-login-attempt', (route) => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      return left > 0
        ? json(route, 200, { allowed: false, lockoutSeconds: left, attemptsRemaining: 0 })
        : json(route, 200, { allowed: true, attemptsRemaining: Math.max(0, 5 - failures) });
    });

    await page.goto('/auth');
    await page.getByLabel(/email/i).fill('someone@example.com');
    const password = page.getByLabel(/password/i).and(page.locator('input'));
    await password.fill('wrong-password-1');

    // Enter, not click: the failure toasts stack and would sit over the button.
    for (let i = 1; i <= 5; i++) {
      await password.press('Enter');
      await expect.poll(() => failures).toBe(i);
      if (i < 5) await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    }

    const locked = page.getByRole('button', { name: /try again in/i });
    await expect(locked).toBeDisabled();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled({ timeout: (LOCK_SECONDS + 3) * 1000 });
  });
});
