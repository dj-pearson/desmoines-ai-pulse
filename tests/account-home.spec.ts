import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP3: the Account home leads with your week, and /my-events shows
 * plans that exist.
 *
 * Route-mocked end to end. installFixtureBackend answers everything this spec
 * is not about; the handlers registered after it answer the tables that are
 * (Playwright gives the last registered handler the match, and route.fallback()
 * hands anything else back to the fixture backend). The session is seeded the
 * way submission-live-link.spec.ts does it.
 *
 * The fake does NOT filter. event_attendance answers by which date operator the
 * request carries (`gte` for Upcoming, `lt` for Past), because what this spec
 * checks is that the page puts a row where the query said it belongs and never
 * renders an embed that came back empty.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000c3';
const DAY_MS = 24 * 60 * 60 * 1000;

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
          email: 'local@example.com',
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
        // The interests row is WP3 item 9's; it is not what these tests look at.
        localStorage.setItem('dmi_interests_prompt_dismissed_v1', 'true');
      } catch {
        /* private mode - the assertions fail, not this */
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

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: headers(), body: JSON.stringify(body) });

/** A count-only HEAD answer. supabase-js reads the total off Content-Range. */
const headCount = (route: Route, total: number) =>
  route.fulfill({ status: 200, headers: headers({ 'content-range': total > 0 ? `0-${total - 1}/${total}` : '*/0' }), body: '' });

function planEvent(id: string, title: string, startMs: number) {
  const iso = new Date(startMs).toISOString();
  return {
    id,
    title,
    date: iso,
    event_start_utc: iso,
    event_start_local: null,
    venue: 'Fixture Hall',
    location: 'Des Moines, IA',
    category: 'Music',
    image_url: null,
    price: null,
  };
}

// Two days out: inside the week whatever the hour, and never "past".
const FUTURE = planEvent('30000000-0000-4000-8000-000000000001', 'Porch Concert in Beaverdale', Date.now() + 2 * DAY_MS);
const PAST = planEvent('30000000-0000-4000-8000-000000000002', 'Last Month at Jazz in July', Date.now() - 10 * DAY_MS);

interface Backend {
  attendanceStatus?: number;
  savedEvents?: number;
  savedPlaces?: number;
  submissions?: unknown[];
}

async function mockAccount(page: Page, backend: Backend = {}) {
  await installFixtureBackend(page);
  await seedSession(page);

  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/factors')) return json(route, { all: [], totp: [], phone: [] });
    if (route.request().url().includes('/user')) {
      return json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'local@example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const wantsObject = (request.headers()['accept'] || '').includes('application/vnd.pgrst.object');

    if (url.includes('/rest/v1/event_attendance')) {
      if (backend.attendanceStatus && backend.attendanceStatus >= 400) {
        return json(route, { code: 'XX000', message: 'fixture failure' }, backend.attendanceStatus);
      }
      if (url.includes('events.date=gte.')) return json(route, [{ event_id: FUTURE.id, status: 'going', created_at: FUTURE.date, events: FUTURE }]);
      if (url.includes('events.date=lt.')) return json(route, [{ event_id: PAST.id, status: 'going', created_at: PAST.date, events: PAST }]);
      return json(route, []);
    }
    if (url.includes('/rest/v1/user_event_interactions')) {
      return request.method() === 'HEAD' ? headCount(route, backend.savedEvents ?? 0) : json(route, []);
    }
    if (url.includes('/rest/v1/content_favorites')) {
      return request.method() === 'HEAD' ? headCount(route, backend.savedPlaces ?? 0) : json(route, []);
    }
    if (url.includes('/rest/v1/user_event_reminders')) return json(route, []);
    if (url.includes('/rest/v1/user_submitted_events')) return json(route, backend.submissions ?? []);
    if (url.includes('/rest/v1/campaigns')) {
      return request.method() === 'HEAD' ? headCount(route, 0) : json(route, []);
    }
    if (url.includes('/rest/v1/profiles')) {
      const profile = { id: USER_ID, user_id: USER_ID, email: 'local@example.com', interests: ['music'] };
      return wantsObject ? json(route, profile) : json(route, [profile]);
    }
    if (url.includes('/rest/v1/user_roles')) return json(route, wantsObject ? { role: 'user' } : []);
    return route.fallback();
  });
}

test.describe('/my-events', () => {
  test('signed out, it sends you to sign in and back', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/my-events');
    await expect(page).toHaveURL(/\/auth\?redirect=%2Fmy-events$/, { timeout: 15_000 });
  });

  test('Upcoming shows the future RSVP and Past shows the other', async ({ page }) => {
    await mockAccount(page);
    await page.goto('/my-events');

    const upcoming = page.getByRole('tabpanel');
    await expect(upcoming.getByRole('link', { name: /Porch Concert in Beaverdale/ })).toHaveCount(1, { timeout: 15_000 });
    await expect(upcoming.getByRole('link', { name: /Jazz in July/ })).toHaveCount(0);

    await page.getByRole('tab', { name: /Past/ }).click();
    const past = page.getByRole('tabpanel');
    await expect(past.getByRole('link', { name: /Jazz in July/ })).toHaveCount(1, { timeout: 15_000 });
    await expect(past.getByRole('link', { name: /Porch Concert in Beaverdale/ })).toHaveCount(0);
  });

  test('a failed read shows a retry, not "No upcoming events"', async ({ page }) => {
    await mockAccount(page, { attendanceStatus: 500 });
    await page.goto('/my-events');

    // TanStack retries a 500 before giving up, so allow for the backoff.
    await expect(page.getByRole('button', { name: /try again|retry/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No upcoming events')).toHaveCount(0);
  });
});

test.describe('/dashboard overview', () => {
  test('no submissions means no submission counters', async ({ page }) => {
    await mockAccount(page, { submissions: [] });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Your submissions')).toHaveCount(0);
    await expect(page.getByText(/Submitted Events|Approved Events|Pending Review/)).toHaveCount(0);
  });

  test('two saved restaurants and one saved event read "3 saved"', async ({ page }) => {
    await mockAccount(page, { savedEvents: 1, savedPlaces: 2 });
    await page.goto('/dashboard');

    const saved = page.getByRole('link', { name: '3 saved' });
    await expect(saved).toBeVisible({ timeout: 15_000 });
    await expect(saved).toHaveAttribute('href', '/my-events?tab=saved');
  });

  test('the week leads the page at 390x844 and lists this week\'s RSVP', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAccount(page);
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Your week' })).toBeInViewport({ timeout: 15_000 });
    const week = page.getByRole('region', { name: 'Your week' });
    await expect(week.getByRole('link', { name: /Porch Concert in Beaverdale/ })).toBeVisible();
    await expect(week.getByRole('link', { name: /Jazz in July/ })).toHaveCount(0);
  });
});
