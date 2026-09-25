import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Account plan WP4: the organizer's and advertiser's tabs on /dashboard do what
 * they say.
 *
 * Route-mocked end to end, the submission-live-link.spec.ts pattern:
 * installFixtureBackend answers everything this spec is not about and the
 * handlers registered after it answer the tables that are.
 *
 * THE DELETE TESTS FOLLOW THE FLAG. SUBMISSION_OWNER_DELETE_ENABLED stays false
 * until 20260926000001 is applied, and while it is false no Delete button may
 * render at all; once it flips, a DELETE that comes back with no row must
 * never read as a success. The flag is read from the source rather than
 * imported so this file does not depend on the app's path aliases.
 */

const DELETE_ENABLED = /export const SUBMISSION_OWNER_DELETE_ENABLED = true;/.test(
  readFileSync('src/lib/submissionActions.ts', 'utf8'),
);

const USER_ID = '00000000-0000-4000-8000-0000000000d4';
const LIVE_EVENT_ID = '22222222-0000-4000-8000-0000000000d4';

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
        localStorage.setItem('dmi_interests_prompt_dismissed_v1', 'true');
      } catch {
        /* private mode - the assertions fail, not this */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
}

const HEADERS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: HEADERS, body: JSON.stringify(body) });

function submission(id: string, title: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER_ID,
    title,
    description: 'A fixture submission.',
    // Two weeks out, so a copied date is still in the future.
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    start_time: '19:00',
    end_time: null,
    venue: 'Beaverdale Bandshell',
    location: 'Des Moines, IA',
    address: null,
    price: 'Free',
    category: 'Music',
    website_url: null,
    contact_email: null,
    contact_phone: null,
    image_url: null,
    tags: [],
    status,
    admin_notes: null,
    admin_reviewed_by: null,
    admin_reviewed_at: null,
    submitted_at: '2026-09-01T15:00:00Z',
    created_at: '2026-09-01T15:00:00Z',
    updated_at: '2026-09-01T15:00:00Z',
    triaged_at: null,
    auto_decided: false,
    ...extra,
  };
}

interface Backend {
  submissions?: unknown[];
  /** What the events-by-submission_id lookup answers. */
  published?: unknown[];
  /** The body a DELETE on user_submitted_events answers 200 with. */
  deleteBody?: unknown[];
  campaigns?: unknown[];
  rateCard?: unknown[];
  /** Every request to user_submitted_events and campaigns, method and URL. */
  log?: { method: string; url: string }[];
}

async function mockDashboard(page: Page, backend: Backend = {}) {
  await installFixtureBackend(page);
  await seedSession(page);

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

  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const method = request.method();

    if (url.includes('/rest/v1/user_submitted_events')) {
      backend.log?.push({ method, url });
      if (method === 'DELETE') return json(route, backend.deleteBody ?? []);
      if (method === 'POST') {
        const sent = (request.postDataJSON() as Record<string, unknown>[] | Record<string, unknown>) ?? {};
        const row = Array.isArray(sent) ? sent[0] : sent;
        return json(route, { ...submission('33333333-0000-4000-8000-0000000000d4', String(row.title ?? ''), 'pending'), ...row }, 201);
      }
      if (method === 'PATCH') return json(route, null, 200);
      return json(route, backend.submissions ?? []);
    }
    if (url.includes('/rest/v1/events') && url.includes('submission_id')) {
      return json(route, backend.published ?? []);
    }
    if (url.includes('/rest/v1/campaigns')) {
      backend.log?.push({ method, url });
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...HEADERS, 'content-range': '*/0' }, body: '' });
      return json(route, backend.campaigns ?? []);
    }
    if (url.includes('/rest/v1/ad_rate_card')) return json(route, backend.rateCard ?? []);
    return route.fallback();
  });

  await page.route('**/functions/v1/**', (route) => json(route, {}));
}

test.use({ timezoneId: 'America/Chicago' });

test.describe('account: an organizer\'s submissions (WP4)', () => {
  test('with the owner policies not applied, a sent-back row offers a copy, not an edit or a delete', async ({ page }) => {
    test.skip(DELETE_ENABLED, 'SUBMISSION_OWNER_DELETE_ENABLED is on; the delete test below covers this state');

    const log: Backend['log'] = [];
    await mockDashboard(page, {
      log,
      submissions: [
        submission('11111111-0000-4000-8000-0000000000d4', 'Ingersoll Porch Fest', 'needs_revision', {
          admin_notes: 'Please add the street address.',
          admin_reviewed_at: '2026-09-02T14:00:00Z',
        }),
        submission('11111111-0000-4000-8000-0000000000d5', 'Drake Neighborhood Cleanup', 'rejected', {
          triaged_at: '2026-09-01T15:02:00Z',
          auto_decided: true,
          admin_notes: 'Automatically declined: the submission was missing key details.',
        }),
      ],
    });
    await page.goto('/dashboard?tab=events');

    await expect(page.getByText('Ingersoll Porch Fest')).toBeVisible();
    await expect(page.getByText('Please add the street address.')).toBeVisible();
    await expect(page.getByText(/Checked automatically 2 minutes after you submitted/)).toBeVisible();

    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resubmit a copy' })).toHaveCount(2);

    await page.getByRole('button', { name: 'Resubmit a copy' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/Event Title/)).toHaveValue('Ingersoll Porch Fest');

    const posted = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/user_submitted_events') && r.method() === 'POST',
    );
    await dialog.getByRole('button', { name: /submit/i }).last().click();
    const request = await posted;
    const body = request.postDataJSON() as Record<string, unknown>[] | Record<string, unknown>;
    const row = Array.isArray(body) ? body[0] : body;
    expect(row.title).toBe('Ingersoll Porch Fest');
    expect(row).not.toHaveProperty('id');
    expect(log.filter((entry) => entry.method === 'PATCH')).toHaveLength(0);
  });

  test('a delete that removes no row says so', async ({ page }) => {
    test.skip(!DELETE_ENABLED, 'Delete is hidden until 20260926000001 is applied (D1)');

    const title = 'Sherman Hill Walking Tour';
    await mockDashboard(page, {
      submissions: [submission('11111111-0000-4000-8000-0000000000d6', title, 'pending')],
      deleteBody: [],
    });
    await page.goto('/dashboard?tab=events');

    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText("We couldn't delete this submission.")).toBeVisible();
    await expect(page.getByText(/deleted/i)).toHaveCount(0);
  });

  test('an approved submission with a listing shows it live, with views and an in-app link', async ({ page }) => {
    const id = '11111111-0000-4000-8000-0000000000d7';
    await mockDashboard(page, {
      submissions: [
        submission(id, 'Beaverdale Porch Concert', 'approved', {
          triaged_at: '2026-09-01T15:02:00Z',
          auto_decided: true,
          admin_reviewed_at: '2026-09-01T15:02:01Z',
        }),
      ],
      published: [{ id: LIVE_EVENT_ID, submission_id: id, view_count: 214 }],
    });
    await page.goto('/dashboard?tab=events');

    await expect(page.getByText('Live, 214 views')).toBeVisible();
    const link = page.getByRole('link', { name: /view listing/i });
    await expect(link).toHaveAttribute('href', `/events/${LIVE_EVENT_ID}`);

    // A client-side route change keeps the window; a full page load does not.
    await page.evaluate(() => {
      (window as unknown as { __wp4Marker: number }).__wp4Marker = 1;
    });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/events/${LIVE_EVENT_ID}`));
    expect(await page.evaluate(() => (window as unknown as { __wp4Marker?: number }).__wp4Marker)).toBe(1);
  });
});

test.describe('account: an advertiser\'s campaigns (WP4)', () => {
  const rateCard = [
    { placement_type: 'top_banner', base_daily_rate: 12.5, cpm_rate: 0, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
    { placement_type: 'featured_spot', base_daily_rate: 7, cpm_rate: 0, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
    { placement_type: 'sponsored_listing', base_daily_rate: 20, cpm_rate: 0, discount_7_day: 5, discount_14_day: 10, discount_30_day: 15 },
  ];

  test('own campaigns only, the rate card price, Central dates and no audience claims', async ({ page }) => {
    const log: Backend['log'] = [];
    const campaignId = '44444444-0000-4000-8000-0000000000d4';
    await mockDashboard(page, {
      log,
      rateCard,
      campaigns: [
        {
          id: campaignId,
          name: 'Fall Brunch Push',
          status: 'pending_payment',
          start_date: '2026-10-01',
          end_date: '2026-10-14',
          total_cost: 66.5,
          created_at: '2026-09-20T00:00:00Z',
          updated_at: '2026-09-20T00:00:00Z',
          campaign_placements: [{ id: 'p1' }],
          campaign_creatives: [],
        },
      ],
    });
    await page.goto('/dashboard?tab=advertise');

    await expect(page.getByText('Fall Brunch Push')).toBeVisible();
    // Text, not a test id: vite.config.ts strips data-testid from the
    // production build this lane runs against.
    await expect(page.getByRole('tabpanel').getByText('From $7/day.')).toBeVisible();
    // Oct 1 as a calendar day, not UTC midnight read in Central (Sep 30).
    await expect(page.getByText(/Oct 1 - Oct 14/)).toBeVisible();
    await expect(page.getByText('$66.50')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Complete payment' })).toHaveAttribute('href', `/campaigns/${campaignId}`);
    await expect(page.getByRole('link', { name: 'Open Fall Brunch Push' })).toBeVisible();

    await expect(page.getByText(/50K/)).toHaveCount(0);
    await expect(page.getByText(/thousands of/i)).toHaveCount(0);

    const listRead = log.find((entry) => entry.method === 'GET' && entry.url.includes('campaign_placements'));
    expect(listRead?.url).toContain(`user_id=eq.${USER_ID}`);
  });

  test('no price at all when the rate card cannot be read', async ({ page }) => {
    await mockDashboard(page, { campaigns: [] });
    await page.route('**/rest/v1/ad_rate_card**', (route) => json(route, { code: 'XX000', message: 'fixture failure' }, 500));
    await page.goto('/dashboard?tab=advertise');

    await expect(page.getByText('No campaigns yet')).toBeVisible();
    await expect(page.getByRole('tabpanel').getByText(/From \$[\d.,]+\/day/)).toHaveCount(0);
    await expect(page.getByRole('tabpanel').getByText(/\$\d/)).toHaveCount(0);
  });
});
