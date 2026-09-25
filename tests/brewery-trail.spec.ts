import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Eat & Drink pass 2 WP4.8-4.11: /breweries.
 *
 * The passport counts only places you can walk into, a failed check-ins read
 * shows no Check in button (so nothing can overwrite a first visit), a first
 * visit is an INSERT, upcoming places sit in their own group, and a failed
 * breweries read is noindex. Rows come from page.route on top of the fixture
 * backend; the fixture backend does not filter, so the page's own split is
 * what is under test.
 */

const USER_ID = '99999999-0000-0000-0000-000000000001';
const ISO = '2026-09-01T00:00:00Z';

function brewery(i: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id: `70000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name,
    city: 'Des Moines',
    created_at: ISO,
    cuisine: 'Brewery',
    data_quality_score: 80,
    description: 'A fixture brewery.',
    enhanced: false,
    google_place_id: null,
    image_url: null,
    is_featured: false,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.59,
    location: `${100 + i} E Grand Ave`,
    longitude: -93.61,
    merged_at: null,
    merged_into: null,
    opening: 'Daily 11am-11pm',
    opening_date: null,
    opening_timeframe: null,
    phone: '515-555-0100',
    popularity_score: 50,
    price_range: '$$',
    rating: 4.5,
    slug: `fixture-brewery-${i}`,
    source_url: null,
    status: 'open',
    updated_at: ISO,
    website: null,
    writeup_generated_at: null,
    ...extra,
  };
}

const BREWERIES = [
  brewery(1, 'Exile Brewing Company'),
  brewery(2, 'Confluence Brewing'),
  brewery(3, 'Fox Brewing Co.'),
  brewery(4, 'Kinship Brewing'),
  brewery(5, 'Future Hops Brewing', { status: 'opening_soon', opening_date: '2026-11-14', opening: null }),
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

async function seedSession(page: Page) {
  await page.addInitScript(
    ({ userId }) => {
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
          email: 'trail@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(session));
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: false, advertising: false }),
        );
      } catch {
        /* private mode */
      }
    },
    { userId: USER_ID },
  );
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/user')
      ? json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'trail@example.com', app_metadata: {}, user_metadata: {}, created_at: ISO })
      : json(route, {}),
  );
}

interface Setup {
  signedIn?: boolean;
  breweriesFail?: boolean;
  checkins?: 'fail' | unknown[];
  insertStatus?: number;
}

async function setup(page: Page, opts: Setup = {}) {
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  await page.clock.setFixedTime(new Date('2026-09-25T18:00:00Z')); // Fri 13:00 CDT
  await installFixtureBackend(page);
  if (opts.signedIn) await seedSession(page);
  await page.route('**/rest/v1/restaurants?**', (route) =>
    opts.breweriesFail ? json(route, { code: 'XX000', message: 'down' }, 500) : json(route, BREWERIES),
  );
  await page.route('**/rest/v1/brewery_trail_checkins**', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (opts.checkins === 'fail') return json(route, { code: 'XX000', message: 'down' }, 500);
      return json(route, opts.checkins ?? []);
    }
    writes.push({ method, url: route.request().url(), body: route.request().postDataJSON() });
    const status = opts.insertStatus ?? 201;
    if (status === 409) return json(route, { code: '23505', message: 'duplicate key value' }, 409);
    return route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  return writes;
}

test.describe('/breweries', () => {
  test('the passport counts only places that are open, and upcoming ones get their own group', async ({ page }) => {
    await setup(page, {
      signedIn: true,
      checkins: [
        {
          id: 'c1',
          user_id: USER_ID,
          restaurant_id: BREWERIES[0].id,
          checked_in_at: ISO,
          photo_url: null,
          beer_name: 'Gold',
          rating: 4,
        },
      ],
    });
    await page.goto('/breweries');

    const passport = page.locator('[data-brewery-passport]');
    await expect(passport.getByText('1 / 4')).toBeVisible();
    await expect(passport.getByText('1 of 4 visited, 3 to go.')).toBeVisible();

    const upcoming = page.locator('[data-brewery-upcoming]');
    await expect(upcoming.getByRole('heading', { name: 'Opening soon' })).toBeVisible();
    await expect(upcoming.getByRole('link', { name: 'Future Hops Brewing' })).toBeVisible();
    await expect(upcoming).toContainText('Opening Nov 14');
    await expect(page.getByRole('button', { name: 'Check in at Future Hops Brewing' })).toHaveCount(0);

    // A visited place offers "Edit visit", not a second Check in.
    await expect(page.getByRole('button', { name: 'Check in at Exile Brewing Company' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit visit to Exile Brewing Company' })).toBeVisible();

    await expect(page.locator('[data-brewery-intro]')).toContainText('4 craft breweries and taprooms we list');
    await expect(page.getByRole('link', { name: 'Missing one? Tell us' })).toHaveAttribute('href', '/contact');
    await expect(page.getByRole('link', { name: 'View details for Confluence Brewing' })).toBeVisible();
  });

  test('a failed check-ins read shows no Check in button and no count', async ({ page }) => {
    await setup(page, { signedIn: true, checkins: 'fail' });
    await page.goto('/breweries');

    await expect(page.getByRole('heading', { name: 'Breweries on the trail' })).toBeVisible();
    await expect(page.getByText("We couldn't load your check-ins")).toBeVisible();
    await expect(page.getByRole('button', { name: /^Check in at / })).toHaveCount(0);
    await expect(page.getByText(/\b0 \/ 4\b/)).toHaveCount(0);
  });

  test('a first visit is an insert, and a duplicate keeps the first visit', async ({ page }) => {
    const writes = await setup(page, { signedIn: true, checkins: [], insertStatus: 409 });
    await page.goto('/breweries');

    await page.getByRole('button', { name: 'Check in at Kinship Brewing' }).click();
    await page.getByLabel('What are you drinking? (optional)').fill('Pale ale');
    await page.getByRole('dialog').getByRole('button', { name: 'Check in' }).click();

    await expect(page.getByText("You'd already checked in at Kinship Brewing. Your first visit is kept.")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].url).not.toContain('on_conflict');
  });

  test('signed in with the check-in dialog open, axe finds no WCAG A/AA violation in it', async ({ page }) => {
    await setup(page, { signedIn: true, checkins: [] });
    await page.goto('/breweries');
    await page.getByRole('button', { name: 'Check in at Confluence Brewing' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Check in at Confluence Brewing' })).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('signed out, the sign-in link returns here', async ({ page }) => {
    await setup(page);
    await page.goto('/breweries');
    await expect(page.getByRole('link', { name: 'Sign in to start the trail' })).toHaveAttribute(
      'href',
      '/auth?redirect=%2Fbreweries',
    );
  });

  test('a failed breweries read is noindex and says so', async ({ page }) => {
    await setup(page, { breweriesFail: true });
    await page.goto('/breweries');
    await expect(page.getByRole('heading', { name: 'Breweries on the trail' })).toBeVisible();
    await expect(page.getByText('No breweries listed yet.')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('in the prerender there is no open/closed line', async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
    await setup(page);
    await page.goto('/breweries');
    await expect(page.getByRole('heading', { name: 'Exile Brewing Company' })).toBeVisible();
    const main = page.locator('section[aria-labelledby="breweries-heading"]');
    await expect(main).not.toContainText('Open until');
    await expect(main).not.toContainText('Closed, opens');
  });
});
