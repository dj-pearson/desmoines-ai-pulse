import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Business plan WP3: /business is a workspace built on tables something
 * writes, and /business-partnership has a way in for someone without an
 * account.
 *
 * Route-mocked end to end (the smoke lane builds with placeholder
 * VITE_SUPABASE_*). installFixtureBackend answers everything this spec is not
 * about; the handlers registered after it answer the tables that are and
 * fall back for the rest.
 */

const USER_ID = '00000000-0000-4000-8000-0000000000b3';
const CLAIM_ID = '11111111-0000-4000-8000-0000000000b3';
const RESTAURANT_ID = '22222222-0000-4000-8000-0000000000b3';
const SUBMISSION_ID = '33333333-0000-4000-8000-0000000000b3';
const LIVE_EVENT_ID = '44444444-0000-4000-8000-0000000000b3';

/** update_claimed_listing's restaurant whitelist (20260920000005). */
const RESTAURANT_WHITELIST = ['description', 'website', 'phone', 'image_url', 'menu_url'];

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

function seedConsent(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
      );
    } catch {
      /* private mode - the assertions fail, not this */
    }
  });
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
          email: 'owner@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
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

interface Backend {
  /** Rows for business_claims, or 'missing' to answer 42P01 as before 20260920000005. */
  claims?: unknown[] | 'missing';
  submissions?: unknown[];
  published?: unknown[];
  /** Every body POSTed to rpc/update_claimed_listing. */
  updateBodies?: Record<string, unknown>[];
}

async function mockWorkspace(page: Page, backend: Backend = {}) {
  await installFixtureBackend(page);
  await seedConsent(page);
  await seedSession(page);

  await page.route('**/auth/v1/**', (route) => {
    if (route.request().url().includes('/factors')) return json(route, { all: [], totp: [], phone: [] });
    if (route.request().url().includes('/user')) {
      return json(route, {
        id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    return json(route, {});
  });

  await page.route('**/rest/v1/**', (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());

    if (url.includes('/rest/v1/rpc/update_claimed_listing')) {
      backend.updateBodies?.push(request.postDataJSON() as Record<string, unknown>);
      return json(route, true);
    }
    if (url.includes('/rest/v1/business_claims')) {
      if (backend.claims === 'missing') {
        return json(route, { code: '42P01', message: 'relation "public.business_claims" does not exist' }, 404);
      }
      return json(route, backend.claims ?? []);
    }
    if (url.includes('/rest/v1/restaurants') && url.includes(RESTAURANT_ID)) {
      return json(route, [
        {
          id: RESTAURANT_ID,
          name: 'Fixture Corner Bistro',
          slug: 'fixture-corner-bistro',
          description: 'A fixture restaurant.',
          website: 'https://fixturebistro.example',
          phone: '515-000-0000',
          image_url: null,
          menu_url: null,
        },
      ]);
    }
    if (url.includes('/rest/v1/user_submitted_events')) return json(route, backend.submissions ?? []);
    if (url.includes('/rest/v1/events') && url.includes('submission_id')) return json(route, backend.published ?? []);
    if (url.includes('/rest/v1/campaigns')) {
      if (request.method() === 'HEAD') {
        return route.fulfill({ status: 200, headers: { ...HEADERS, 'content-range': '*/0' }, body: '' });
      }
      return json(route, []);
    }
    return route.fallback();
  });

  await page.route('**/functions/v1/**', (route) => json(route, {}));
}

function verifiedClaim() {
  return {
    id: CLAIM_ID,
    listing_type: 'restaurant',
    listing_id: RESTAURANT_ID,
    status: 'verified',
    method: 'email_domain',
    verified_at: '2026-09-20T15:00:00Z',
    created_at: '2026-09-20T15:00:00Z',
  };
}

function liveSubmission() {
  return {
    id: SUBMISSION_ID,
    user_id: USER_ID,
    title: 'Fixture Porch Concert',
    description: 'A fixture submission.',
    date: '2026-10-10',
    start_time: '19:00',
    status: 'approved',
    submitted_at: '2026-09-01T15:00:00Z',
    created_at: '2026-09-01T15:00:00Z',
    updated_at: '2026-09-01T15:00:00Z',
    triaged_at: '2026-09-01T15:02:00Z',
    auto_decided: true,
  };
}

test.use({ timezoneId: 'America/Chicago' });

test.describe('/business workspace (business WP3)', () => {
  test('a verified claim is listed, and its edit sends only whitelisted keys', async ({ page }) => {
    const updateBodies: Record<string, unknown>[] = [];
    await mockWorkspace(page, { claims: [verifiedClaim()], updateBodies });
    await page.goto('/business');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Fixture Corner Bistro' })).toBeVisible();
    await expect(page.getByText('Verified from your email domain')).toBeVisible();

    const promote = page.getByRole('link', { name: 'Promote this listing' });
    await expect(promote).toHaveAttribute('href', `/advertise?listingType=restaurant&listingId=${RESTAURANT_ID}`);

    await page.getByRole('button', { name: 'Edit details' }).click();
    const phone = page.getByLabel('Phone', { exact: true });
    await phone.fill('515-555-0142');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect.poll(() => updateBodies.length).toBe(1);
    const body = updateBodies[0];
    expect(body.p_listing_type).toBe('restaurant');
    expect(body.p_listing_id).toBe(RESTAURANT_ID);
    const patch = body.p_patch as Record<string, unknown>;
    for (const key of Object.keys(patch)) expect(RESTAURANT_WHITELIST).toContain(key);
    // Only what changed: the description the form loaded is not re-sent.
    expect(patch).toEqual({ phone: '515-555-0142' });
  });

  test('with business_claims missing (42P01) the section is empty and the page still renders', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await mockWorkspace(page, { claims: 'missing' });
    await page.goto('/business');

    await expect(page.getByRole('heading', { name: 'Your listings' })).toBeVisible();
    await expect(page.getByText("You haven't claimed a listing yet.")).toBeVisible();
    await expect(page.getByText("Your listings didn't load")).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('a live submission offers "Promote this event" with its live event id', async ({ page }) => {
    await mockWorkspace(page, {
      submissions: [liveSubmission()],
      published: [{ id: LIVE_EVENT_ID, submission_id: SUBMISSION_ID, view_count: 12 }],
    });
    await page.goto('/business');

    await expect(page.getByText('Fixture Porch Concert')).toBeVisible();
    await expect(page.getByText('Live on the site')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Promote this event' })).toHaveAttribute(
      'href',
      `/advertise?listingType=event&listingId=${LIVE_EVENT_ID}`,
    );
    await expect(page.getByRole('link', { name: 'View listing' })).toHaveAttribute('href', `/events/${LIVE_EVENT_ID}`);
  });

  test('signed out, /business asks for sign-in with links that come back here', async ({ page }) => {
    await installFixtureBackend(page);
    await seedConsent(page);
    await page.goto('/business');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // index.html's critical CSS paints every h1 #fff for the home hero; a page
    // h1 without its own colour is white on white.
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('a[href="/auth?redirect=/business"]')).not.toHaveCount(0);
    await expect(page.locator('a[href="/auth?mode=signup&redirect=/business"]')).not.toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('/business-partnership (business WP3)', () => {
  test('signed out, the inquiry form writes contact_submissions as a partnership inquiry', async ({ page }) => {
    const inserts: Record<string, unknown>[] = [];
    await installFixtureBackend(page);
    await seedConsent(page);
    await page.route('**/rest/v1/contact_submissions*', (route) => {
      if (route.request().method() === 'POST') {
        const sent = route.request().postDataJSON() as Record<string, unknown> | Record<string, unknown>[];
        inserts.push(Array.isArray(sent) ? sent[0] : sent);
        return route.fulfill({ status: 201, headers: HEADERS, body: '' });
      }
      return route.fallback();
    });

    await page.goto('/business-partnership');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveCSS('color', 'rgb(255, 255, 255)');
    // One FAQPage, emitted next to the questions it describes (SEO-003).
    await expect(page.getByRole('heading', { name: 'Questions owners ask' })).toBeVisible();
    await expect
      .poll(async () =>
        (await page.locator('script[type="application/ld+json"]').allTextContents()).filter((t) => t.includes('"FAQPage"')).length,
      )
      .toBe(1);
    // No second price list: the ad packages tab and its monthly prices are gone.
    await expect(page.getByText(/\/month/)).toHaveCount(0);
    await expect(page.getByText(/Most Popular/i)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Get in touch' }).click();
    await page.getByLabel('Your name').fill('Pat Owner');
    await page.getByLabel('Business', { exact: true }).fill('Fixture Corner Bistro');
    await page.getByLabel('Email', { exact: true }).fill('pat@fixturebistro.example');
    await page.getByLabel('What can we help with?').fill('How do I get our patio hours corrected?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect.poll(() => inserts.length).toBe(1);
    expect(inserts[0]).toMatchObject({
      inquiry_type: 'partnership',
      name: 'Pat Owner',
      email: 'pat@fixturebistro.example',
    });
    await expect(page.getByText("Thanks, that's with us.")).toBeVisible();
  });
});
