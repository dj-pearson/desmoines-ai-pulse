/**
 * plan-stay WP3: /visitors-guide is the guide, and the /group-travel lead form
 * promises nothing it cannot keep.
 *
 * Before this, /visitors-guide said "Check your email for the download link!"
 * when no code sends that email and there is no PDF, and "Your free guide is
 * on its way!" for a printed copy nobody mails. Both handlers ignored
 * supabase-js's { error }, so the success toast fired even when the insert
 * failed. /group-travel promised a reply "within 2 business days" from a table
 * nothing reads, and read a venue outage as "No venues match your filters".
 *
 * Rows come from installFixtureBackend; each test that needs a specific table
 * shape registers its own route AFTER it (the last handler wins). Selectors
 * are roles and plain data-* attributes because vite strips data-testid.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const CORS = { 'access-control-allow-origin': '*' };

/** A PostgREST error that the app's retry policy does not retry, so the error branch shows at once. */
async function failTable(page: Page, table: string) {
  await page.route(`**/rest/v1/${table}*`, (route: Route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ code: 'PGRST100', message: 'fixture failure', details: null, hint: null }),
    }),
  );
}

const VENUE = {
  id: '30000000-0000-0000-0000-000000000001',
  name: 'Fixture Hall',
  slug: 'fixture-hall',
  venue_type: 'conference_center',
  max_capacity: 800,
  min_capacity: 20,
  sq_footage: 12000,
  amenities: [],
  catering: 'in_house',
  av_equipment: true,
  website: 'https://fixture-hall.example.com',
  contact_email: null,
  image_url: null,
  description: 'A venue supplied by tests/visitors-guide.spec.ts.',
  latitude: 41.59,
  longitude: -93.62,
  created_at: '2026-01-01T00:00:00Z',
};

test.describe('/visitors-guide', () => {
  test('links to our own listings and promises no delivery', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/visitors-guide');
    await expect(page.getByRole('heading', { level: 1, name: 'Des Moines Visitor Guide' })).toBeVisible();

    for (const href of ['/events', '/restaurants/open-now', '/stay', '/getting-around']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
    }

    for (const phrase of [/Check your email/i, /on its way/i, /2026 Edition/i, /Request Free Copy/i, /Download Free Guide/i]) {
      await expect(page.getByText(phrase)).toHaveCount(0);
    }
    await expect(page.getByRole('heading', { name: 'Get the weekly Des Moines picks' })).toBeVisible();
  });

  test('shows this weekend from the events rows', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/visitors-guide');
    const weekend = page.getByRole('region', { name: 'This weekend' });
    await expect(weekend).toBeVisible();
    expect(await weekend.locator('a[href^="/events/"]').count()).toBeGreaterThan(0);
  });

  test('hides the weekend module when events fail, and keeps the rest', async ({ page }) => {
    await installFixtureBackend(page);
    await failTable(page, 'events');
    await page.goto('/visitors-guide');
    await expect(page.getByRole('heading', { name: 'Open now' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This weekend' })).toHaveCount(0);
    await expect(page.locator('a[href="/getting-around"]').first()).toBeAttached();
  });
});

test.describe('/group-travel', () => {
  test('a venue outage reads as an error with retry, not as no matches', async ({ page }) => {
    await installFixtureBackend(page);
    await failTable(page, 'meeting_venues');
    await page.goto('/group-travel');
    await expect(page.getByText("Venues didn't load")).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
    await expect(page.getByText('No venues match your filters.')).toHaveCount(0);
  });

  test('marketing stat tiles and the reply-time promise are gone', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/group-travel');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/30% Below/i)).toHaveCount(0);
    await expect(page.getByText(/80% of US/i)).toHaveCount(0);
    await expect(page.getByText(/2 business days/i)).toHaveCount(0);
  });

  test('venue filters live in the URL', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/group-travel?type=hotel&capacity=250');
    await expect(page.getByRole('combobox', { name: 'Venue type' })).toContainText('Hotels');
    await expect(page.getByRole('combobox', { name: 'Minimum capacity' })).toContainText('250+');
  });

  test('"Request this venue" pre-fills the RFP', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/meeting_venues*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([VENUE]) }),
    );
    await page.goto('/group-travel');
    await expect(page.getByRole('link', { name: 'Visit Fixture Hall website' })).toHaveAttribute(
      'href',
      // safeWebUrl hands back the parsed URL's href, which normalises the
      // bare origin to a trailing slash.
      new URL(VENUE.website).href,
    );
    await page.getByRole('button', { name: 'Request Fixture Hall' }).click();
    await expect(page.getByLabel('Venue Requirements')).toHaveValue(/Interested in: Fixture Hall/);
  });

  test('client-side checks block a bad email before any request', async ({ page }) => {
    await installFixtureBackend(page);
    let inserts = 0;
    await page.route('**/rest/v1/rfp_submissions*', (route) => {
      inserts += 1;
      return route.fulfill({ status: 201, headers: CORS, body: '' });
    });
    await page.goto('/group-travel');
    await page.getByLabel('Event Name *').fill('Retreat');
    await page.getByLabel('Contact Name *').fill('Pat Doe');
    await page.getByLabel('Contact Email *').fill('not-an-email');
    await page.getByRole('button', { name: 'Submit RFP' }).click();
    await expect(page.getByLabel('Contact Email *')).toHaveAttribute('aria-invalid', 'true');
    expect(inserts).toBe(0);
  });

  test('a failed insert shows an error, never a success', async ({ page }) => {
    await installFixtureBackend(page);
    await failTable(page, 'rfp_submissions');
    await page.goto('/group-travel');
    await page.getByLabel('Event Name *').fill('Retreat');
    await page.getByLabel('Contact Name *').fill('Pat Doe');
    await page.getByLabel('Contact Email *').fill('pat@example.com');
    await page.getByRole('button', { name: 'Submit RFP' }).click();
    await expect(page.getByText(/did not go through/)).toBeVisible();
    await expect(page.getByText(/Request received/)).toHaveCount(0);
  });
});
