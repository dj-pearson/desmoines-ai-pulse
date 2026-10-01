/**
 * /group-travel (plan-stay WP3, pass 2 WP3).
 *
 * The first pass stopped the page promising a reply "within 2 business days"
 * from a table nothing reads. Pass 2 sends the request where someone does
 * read: contact_submissions, as a 'business' inquiry the admin inbox shows,
 * and nothing goes to rfp_submissions any more.
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
  sq_footage: 12000,
  catering: 'in_house',
  av_equipment: true,
  website: 'https://fixture-hall.example.com',
  description: "Hy-Vee Hall and Wells Fargo Arena, as the seed still says. Supplied by tests/group-travel.spec.ts.",
};

async function withVenue(page: Page) {
  await page.route('**/rest/v1/meeting_venues*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([VENUE]) }),
  );
}

/** Record every write to both tables; answer contact_submissions with `status`. */
async function recordWrites(page: Page, status = 201) {
  const contact: Array<Record<string, unknown>> = [];
  let rfp = 0;
  await page.route('**/rest/v1/rfp_submissions*', (route) => {
    rfp += 1;
    return route.fulfill({ status: 201, headers: CORS, body: '' });
  });
  await page.route('**/rest/v1/contact_submissions*', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      contact.push(...(Array.isArray(body) ? body : [body]));
    }
    return status >= 400
      ? route.fulfill({
          status,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify({ code: 'PGRST100', message: 'fixture failure', details: null, hint: null }),
        })
      : route.fulfill({ status, headers: CORS, body: '' });
  });
  return { contact, rfpCount: () => rfp };
}

async function fillRequired(page: Page, email = 'pat@example.com') {
  await page.getByLabel('Event Name *').fill('Retreat');
  await page.getByLabel('Contact Name *').fill('Pat Doe');
  await page.getByLabel('Contact Email *').fill(email);
}

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
    await expect(page.getByText(/through its website above/i)).toHaveCount(0);
  });

  test('venue filters live in the URL', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/group-travel?type=hotel&capacity=250');
    await expect(page.getByRole('combobox', { name: 'Venue type' })).toContainText('Hotels');
    await expect(page.getByRole('combobox', { name: 'Minimum capacity' })).toContainText('250+');
  });

  test('the venue read names its columns and sorts blanks last', async ({ page }) => {
    await installFixtureBackend(page);
    const urls: string[] = [];
    await page.route('**/rest/v1/meeting_venues*', (route) => {
      urls.push(decodeURIComponent(route.request().url()));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify([VENUE]) });
    });
    await page.goto('/group-travel');
    await expect(page.getByRole('heading', { name: 'Fixture Hall' })).toBeVisible();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).not.toMatch(/select=\*/);
    expect(urls[0]).toContain('order=max_capacity.desc.nullslast');
  });

  test('"Request this venue" pre-fills the RFP and says so', async ({ page }) => {
    await installFixtureBackend(page);
    await withVenue(page);
    await page.goto('/group-travel');
    await expect(page.getByRole('link', { name: 'Visit Fixture Hall website' })).toHaveAttribute(
      'href',
      // safeWebUrl hands back the parsed URL's href, which normalises the
      // bare origin to a trailing slash.
      new URL(VENUE.website).href,
    );
    await page.getByRole('button', { name: 'Request Fixture Hall' }).click();
    await expect(page.getByLabel('Venue Requirements')).toHaveValue(/Interested in: Fixture Hall/);
    await expect(page.getByRole('status').filter({ hasText: 'Added Fixture Hall to your request.' })).toBeVisible();
  });

  test('venue text uses the arena\'s current name', async ({ page }) => {
    await installFixtureBackend(page);
    await withVenue(page);
    await page.goto('/group-travel');
    await expect(page.getByText(/Casey's Center, as the seed still says/)).toBeVisible();
    await expect(page.getByText(/Wells Fargo Arena/)).toHaveCount(0);
  });

  test('client-side checks block a bad email before any request', async ({ page }) => {
    await installFixtureBackend(page);
    const writes = await recordWrites(page);
    await page.goto('/group-travel');
    await fillRequired(page, 'not-an-email');
    await page.getByRole('button', { name: 'Submit RFP' }).click();
    await expect(page.getByLabel('Contact Email *')).toHaveAttribute('aria-invalid', 'true');
    expect(writes.contact).toHaveLength(0);
    expect(writes.rfpCount()).toBe(0);
  });

  test('a sent RFP goes to contact_submissions as a business inquiry, never to rfp_submissions', async ({ page }) => {
    await installFixtureBackend(page);
    const writes = await recordWrites(page);
    await page.goto('/group-travel');
    await fillRequired(page);
    await page.getByLabel('Venue Requirements').fill('Breakout rooms');
    await page.getByRole('button', { name: 'Submit RFP' }).click();

    await expect(page.getByRole('status').filter({ hasText: "We'll reply to pat@example.com" })).toBeVisible();
    expect(writes.contact).toHaveLength(1);
    const row = writes.contact[0];
    expect(row.inquiry_type).toBe('business');
    expect(row.subject).toBe('Group RFP: Retreat');
    expect(row.source_page).toBe('/group-travel');
    expect(row.email).toBe('pat@example.com');
    expect(String(row.message)).toContain('Venue requirements:\nBreakout rooms');
    // A blank attendance is left out, not sent as 0.
    expect(String(row.message)).not.toMatch(/attendance/i);
    expect(writes.rfpCount()).toBe(0);
  });

  test('a failed send shows an error, never a success', async ({ page }) => {
    await installFixtureBackend(page);
    const writes = await recordWrites(page, 400);
    await page.goto('/group-travel');
    await fillRequired(page);
    await page.getByRole('button', { name: 'Submit RFP' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /did not go through/ })).toBeVisible();
    await expect(page.getByText(/We'll reply to/)).toHaveCount(0);
    expect(writes.rfpCount()).toBe(0);
  });

  test('the honeypot is not a field autofill would fill, and a hit writes nothing', async ({ page }) => {
    await installFixtureBackend(page);
    const writes = await recordWrites(page);
    await page.goto('/group-travel');
    const trap = page.locator('input[name="hp_ref"]');
    await expect(trap).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('input[name="company_website"]')).toHaveCount(0);
    await fillRequired(page);
    await trap.fill('https://spam.example', { force: true });
    await page.getByRole('button', { name: 'Submit RFP' }).click();
    await expect(page.getByRole('status').filter({ hasText: "We'll reply to" })).toBeVisible();
    expect(writes.contact).toHaveLength(0);
    expect(writes.rfpCount()).toBe(0);
  });
});
