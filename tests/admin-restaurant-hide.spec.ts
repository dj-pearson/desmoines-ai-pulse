/**
 * Hiding a restaurant replaces deleting it (WEB-FEAT-103).
 *
 * The admin Delete button used to run a row DELETE: the URL started answering
 * "not found", nothing recorded the removal, and the next scrape could add the
 * place back. Now the admin opens the restaurant's record, hides it, and the
 * public page says the listing was removed.
 *
 * Route-mocked on tests/support/fixtureBackend.ts with a seeded admin session
 * (the smoke lane builds with placeholder VITE_SUPABASE_*). Pins:
 *   - the records table lists the row under Listed and not under Hidden;
 *   - Hide sends exactly one hide_restaurant call with the id and the reason,
 *     never a DELETE on restaurants;
 *   - afterwards the row is under Hidden, not under Listed, and the drawer
 *     offers Unhide;
 *   - the public page of a hidden listing says it was removed, and a slug that
 *     never existed still says not found (counter-assertion).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const ADMIN_ID = '00000000-0000-4000-8000-0000000000ad';
const ROW = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Gone Grill',
  slug: 'gone-grill',
  location: '1 Locust St, Des Moines, IA',
  status: 'open',
  business_status: 'OPERATIONAL',
  google_place_id: 'place-gone',
  hours_checked_at: '2026-11-01T12:00:00Z',
  is_merged: false,
  merged_into: null,
  created_at: '2026-01-01T00:00:00Z',
  hours_json: null,
  reservation_url: null,
};

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function seedAdmin(page: Page) {
  await page.addInitScript(
    ({ userId, storageKey }) => {
      const user = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@example.com',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          }),
        );
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: ADMIN_ID, storageKey: authStorageKey() },
  );
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/user')
      ? json(route, { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {} })
      : json(route, {}),
  );
}

/** The admin page's backend, with one restaurant whose hidden state flips when hide_restaurant is called. */
async function adminBackend(page: Page) {
  const state = { hidden: false, hideBodies: [] as unknown[], deletes: 0 };
  await installFixtureBackend(page);
  await page.route('**/rest/v1/user_roles*', (route) => json(route, [{ role: 'admin' }]));
  await page.route('**/rest/v1/restaurants*', (route) => {
    if (route.request().method() === 'DELETE') {
      state.deletes += 1;
      return json(route, []);
    }
    const url = decodeURIComponent(route.request().url());
    const row = { ...ROW, hidden_at: state.hidden ? '2026-11-21T15:00:00Z' : null, hidden_reason: state.hidden ? 'Closed for good' : null };
    if (url.includes(`id=eq.${ROW.id}`)) return json(route, [row]);
    // The records table: its select names hours_checked_at and hidden_at.
    if (url.includes('hidden_at') && url.includes('hours_checked_at')) {
      if (url.includes('hidden_at=not.is.null')) return json(route, state.hidden ? [row] : []);
      if (url.includes('hidden_at=is.null')) return json(route, state.hidden ? [] : [row]);
      return json(route, [row]);
    }
    return json(route, []);
  });
  await page.route('**/rest/v1/rpc/hide_restaurant', async (route) => {
    state.hideBodies.push(route.request().postDataJSON());
    state.hidden = true;
    await json(route, { id: ROW.id, hidden_at: '2026-11-21T15:00:00Z' });
  });
  return state;
}

test.describe('admin: hide a restaurant (WEB-FEAT-103)', () => {
  test('Hide keeps the row, moves it from Listed to Hidden, and sends no DELETE', async ({ page }) => {
    await seedAdmin(page);
    const state = await adminBackend(page);
    await page.goto('/admin/content?tab=restaurants');

    const records = page.getByRole('region', { name: 'Restaurant records' });
    await expect(records).toBeVisible({ timeout: 20_000 });
    await expect(records.getByRole('cell', { name: /^Gone Grill/ })).toBeVisible();

    // Counter-assertion: before the hide, the Hidden view is empty.
    await records.getByLabel('Show').selectOption('hidden');
    await expect(records.getByText('No restaurants match.')).toBeVisible();
    await records.getByLabel('Show').selectOption('listed');
    await expect(records.getByRole('cell', { name: /^Gone Grill/ })).toBeVisible();

    await records.getByRole('button', { name: 'Open Gone Grill' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Gone Grill' })).toBeVisible();
    await expect(drawer.getByText('place-gone').first()).toBeVisible();
    await drawer.getByLabel('Reason (optional)').fill('  Closed for good  ');
    await drawer.getByRole('button', { name: 'Hide listing' }).click();

    await expect(drawer.getByRole('button', { name: 'Unhide listing' })).toBeVisible();
    expect(state.hideBodies).toEqual([{ p_restaurant_id: ROW.id, p_reason: 'Closed for good' }]);
    expect(state.deletes).toBe(0);

    await page.keyboard.press('Escape');
    await expect(records.getByText('No restaurants match.')).toBeVisible();
    await records.getByLabel('Show').selectOption('hidden');
    await expect(records.getByRole('cell', { name: /^Gone Grill/ })).toBeVisible();
    await expect(records.getByRole('table').getByText('Hidden', { exact: true })).toBeVisible();
  });
});

test.describe('the public page of a hidden restaurant (WEB-FEAT-103)', () => {
  async function publicBackend(page: Page) {
    await installFixtureBackend(page);
    // A visitor reads a hidden row as absent (RLS), so every restaurants read is empty.
    await page.route('**/rest/v1/restaurants*', (route) => json(route, []));
    await page.route('**/rest/v1/rpc/get_removed_restaurant', (route) => {
      const body = route.request().postDataJSON() as { p_ref?: string };
      return json(route, body?.p_ref === ROW.slug ? [{ id: ROW.id, name: ROW.name, slug: ROW.slug, hidden_at: '2026-11-21T15:00:00Z' }] : []);
    });
  }

  test('says the listing was removed instead of not found', async ({ page }) => {
    await publicBackend(page);
    await page.goto(`/restaurants/${ROW.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: 'This listing was removed' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Gone Grill is no longer listed on Des Moines Insider.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse restaurants' })).toHaveAttribute('href', '/restaurants');
  });

  test('counter-check: a slug that never existed is still not found', async ({ page }) => {
    await publicBackend(page);
    await page.goto('/restaurants/never-a-restaurant-xyz');
    await expect(page.getByRole('heading', { level: 1, name: 'Restaurant Not Found' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'This listing was removed' })).toHaveCount(0);
  });
});
