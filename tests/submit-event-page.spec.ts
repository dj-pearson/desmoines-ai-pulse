import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Business plan WP3 item 7: /submit-event states the real process.
 *
 * The signed-out branch used to have no h1 at all (only a CardTitle h3) and
 * the signed-in branch put its h1 in a sticky bar; both promised review
 * "within 48 hours", which nothing guarantees. Route-mocked, so it runs in the
 * smoke lane with placeholder VITE_SUPABASE_*.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000e7';

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

function seed(page: Page, signedIn: boolean) {
  return page.addInitScript(
    ({ userId, storageKey, withSession }) => {
      try {
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
        if (withSession) {
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
                email: 'organizer@example.com',
                email_confirmed_at: '2026-01-01T00:00:00Z',
                app_metadata: { provider: 'email' },
                user_metadata: {},
                created_at: '2026-01-01T00:00:00Z',
              },
            }),
          );
        }
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey(), withSession: signedIn },
  );
}

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

test.describe('/submit-event (business WP3)', () => {
  test('signed out: one h1, the real review sentence, and a sign-up link that comes back', async ({ page }) => {
    await installFixtureBackend(page);
    await seed(page, false);
    await page.goto('/submit-event');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Submit an event');
    // index.html paints every h1 #fff for the home hero (see business-hub.spec).
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.getByText(/checked automatically within a few minutes/)).toBeVisible();
    await expect(page.getByText(/48 hours|thousands/i)).toHaveCount(0);
    await expect(page.locator('a[href="/auth?mode=signup&redirect=/submit-event"]')).toHaveText('Create free account');
    await expect(page.locator('a[href="/auth?redirect=/submit-event"]')).not.toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/submit-event$/);
  });

  test('signed in: one h1 and the form', async ({ page }) => {
    await installFixtureBackend(page);
    await seed(page, true);
    await page.route('**/auth/v1/**', (route) => {
      if (route.request().url().includes('/factors')) return json(route, { all: [], totp: [], phone: [] });
      if (route.request().url().includes('/user')) {
        return json(route, {
          id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'organizer@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        });
      }
      return json(route, {});
    });
    await page.goto('/submit-event');

    await expect(page.getByRole('heading', { name: 'Event details' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // The page's own copy only. The form's "48 hours" line is the Account
    // plan's file (EventSubmissionForm.tsx) and is a hand-off from here.
    await expect(page.locator('header').getByText(/48 hours|thousands/i)).toHaveCount(0);
  });
});
