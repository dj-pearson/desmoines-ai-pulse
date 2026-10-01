import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Watch a search from /search, and one saved-search list (search plan WP3).
 *
 * Rows come from tests/support/fixtureBackend. nlp-search is stubbed with an
 * events result so the watch button renders, and every call to
 * create_event_saved_search is counted, so "no RPC call" is a number.
 *
 * Neither path needs real auth. Signed out is no session at all. "Free" is a
 * session shaped the way supabase-js stores it (as in best-of-voting.spec.ts)
 * with no user_subscriptions rows, which the fixture backend answers with [] -
 * so the client resolves the free tier. The server would refuse the RPC for
 * that user anyway; what this checks is that the client never sends it.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000c3';

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

/** Keeps the cookie banner off the page. Shape from CookieConsentBanner. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
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

async function seedSession(page: Page) {
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
          email: 'watcher@example.com',
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
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/user')
      ? json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'watcher@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
      : json(route, {}),
  );
}

/** nlp-search answering with one event and the WP1 chip fields. */
async function stubSearch(page: Page) {
  await page.route('**/functions/v1/nlp-search**', (route) =>
    json(route, {
      success: true,
      query: 'jazz',
      parsedIntent: { contentTypes: ['events'], keywords: ['jazz'], confidence: 0.9, originalQuery: 'jazz' },
      results: {
        events: [
          {
            id: '40000000-0000-0000-0000-000000000001',
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

/** Counts create_event_saved_search calls; registered last so it wins. */
async function countSaves(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.route('**/rest/v1/rpc/create_event_saved_search**', (route) => {
    calls += 1;
    return json(route, { code: 'P0001', message: 'saved_search_limit_reached' }, 400);
  });
  return { calls: () => calls };
}

const watchButton = (page: Page) => page.getByRole('button', { name: 'Watch this search' });

test.describe('Watch a search (search plan WP3)', () => {
  test('signed out, the watch button sends you to sign in and back to this search', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await stubSearch(page);
    const saves = await countSaves(page);

    await page.goto('/search?q=jazz');
    await watchButton(page).click({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/auth\?/);
    const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
    expect(redirect.startsWith('/search')).toBe(true);
    expect(redirect).toContain('q=jazz');
    expect(saves.calls()).toBe(0);
  });

  test('a free member sees the upgrade prompt and no save is sent', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await seedSession(page);
    await stubSearch(page);
    const saves = await countSaves(page);

    await page.goto('/search?q=jazz');
    await expect(watchButton(page)).toBeEnabled({ timeout: 30_000 });
    await watchButton(page).click();

    await expect(page.getByRole('dialog').getByText('Unlock Premium Features')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Watch this search')).toHaveCount(0);
    expect(saves.calls()).toBe(0);
  });

  test('the dashboard lists every saved search, and reads an iOS row by its query', async ({ page }) => {
    await acceptCookies(page);
    await installFixtureBackend(page);
    await seedSession(page);
    await page.route('**/rest/v1/saved_searches**', (route) =>
      json(route, [
        {
          // iOS Events tab: `query`, not `q` (SavedSearchService.swift).
          id: 'd0000000-0000-4000-8000-000000000001',
          user_id: USER_ID,
          name: 'Jazz from the app',
          filters: { query: 'jazz', tab: 'Events', alerts_enabled: true },
          search_type: 'event_list',
          alerts_enabled: true,
          last_alerted_at: null,
          last_used: null,
          use_count: 1,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
        {
          // /search/advanced shape: listed with Open, no bell.
          id: 'd0000000-0000-4000-8000-000000000002',
          user_id: USER_ID,
          name: 'Brunch spots',
          filters: { query: 'brunch', category: 'All', location: '', features: [] },
          search_type: 'advanced',
          alerts_enabled: true,
          last_alerted_at: null,
          last_used: null,
          use_count: 1,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
        },
      ]),
    );

    await page.goto('/dashboard');
    await page.getByRole('tab', { name: 'Saved Searches' }).click({ timeout: 30_000 });

    const ios = page.getByRole('listitem').filter({ hasText: 'Jazz from the app' });
    await expect(ios).toContainText("'jazz'");
    await expect(ios).not.toContainText('All events');
    await expect(ios).not.toContainText('Every new event');

    const advanced = page.getByRole('listitem').filter({ hasText: 'Brunch spots' });
    await expect(advanced.getByRole('link', { name: 'Open Brunch spots' })).toHaveAttribute('href', '/search?q=brunch');
    await expect(advanced.getByRole('button', { name: /Email alerts for/ })).toHaveCount(0);

    // A free account: the bell is off and says why, instead of lit and silent.
    await expect(page.getByText(/^Alerts paused/)).toBeVisible();
    await expect(ios.getByRole('button', { name: 'Email alerts for Jazz from the app' })).toBeDisabled();
  });
});
