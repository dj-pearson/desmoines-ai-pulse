import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * WEB-ADS-008 AC5. The organizer's dashboard links to the event they submitted.
 *
 * WHY THIS IS THE ASSERTION WORTH MAKING. Approval used to mean a green badge
 * and nothing else: nothing copied the submission into `events`, so there was
 * no listing to link to and none of the four screens that said "approved" was
 * describing anything a visitor could see. A link that only renders when a
 * published row was found is the one claim on this page that cannot be made
 * without the thing existing.
 *
 * The two cases below are the pair: approved-and-published shows the link,
 * approved-but-not-published (which is every submission in production until
 * 20260920000001 is applied and both approve paths run) does not. If the link
 * ever renders for the second one, the dashboard is back to asserting a
 * listing exists because a status column says so.
 *
 * Everything is route-mocked: the smoke lane builds with placeholder
 * VITE_SUPABASE_* and must never need a backend.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000a8';
const SUBMISSION_ID = '11111111-0000-4000-8000-0000000000a8';
const LIVE_EVENT_ID = '22222222-0000-4000-8000-0000000000a8';

/**
 * supabase-js stores the session under `sb-<project-ref>-auth-token`, and that
 * ref is a BUILD-TIME value: a placeholder locally, the real host in CI. It is
 * derived from the same variable the build read so the seeded session is
 * findable in both. Same reasoning as subscription-checkout.spec.ts.
 */
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
          email: 'organizer@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
        );
      } catch {
        /* private mode - the test fails on the assertions, not here */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const submission = {
  id: SUBMISSION_ID,
  user_id: USER_ID,
  title: 'Beaverdale Porch Concert',
  description: 'A test submission.',
  date: '2026-10-04',
  venue: 'Beaverdale Bandshell',
  location: 'Des Moines, IA',
  category: 'Music',
  status: 'approved',
  submitted_at: '2026-09-01T00:00:00Z',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

/** `published` is what the events-by-submission_id lookup answers with. */
async function mockDashboard(page: Page, published: unknown[]) {
  await seedSession(page);

  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/user')) {
      return json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated',
        email: 'organizer@example.com', app_metadata: {}, user_metadata: {},
        created_at: new Date().toISOString(),
      });
    }
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/user_submitted_events')) return json(route, [submission]);
    // The second query the hook makes. It is keyed on submission_id, so
    // matching on that is what tells the two events reads apart.
    if (url.includes('/events') && url.includes('submission_id')) return json(route, published);
    if (url.includes('/profiles')) return json(route, [{ id: USER_ID, email: 'organizer@example.com' }]);
    return json(route, []);
  });

  await page.route('**/functions/v1/**', (route) => json(route, {}));
}

test.describe('organizer dashboard: the live listing link (WEB-ADS-008 AC5)', () => {
  test('a published submission links to its listing', async ({ page }) => {
    await mockDashboard(page, [{ id: LIVE_EVENT_ID, submission_id: SUBMISSION_ID }]);
    await page.goto('/dashboard?tab=events');

    await expect(page.getByText('Beaverdale Porch Concert')).toBeVisible();

    const link = page.getByRole('link', { name: /view listing/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/events/${LIVE_EVENT_ID}`);
  });

  test('an approved submission with nothing published shows no link', async ({ page }) => {
    // The state every submission in production is in until the migration is
    // applied - and the state the whole story is about, where "approved" was
    // said by four screens and meant by none of them.
    await mockDashboard(page, []);
    await page.goto('/dashboard?tab=events');

    await expect(page.getByText('Beaverdale Porch Concert')).toBeVisible();
    await expect(page.getByRole('link', { name: /view listing/i })).toHaveCount(0);
  });
});
