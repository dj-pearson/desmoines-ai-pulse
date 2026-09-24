import { test, expect, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WP3 (docs/page-plans/home.md): the "This week in Des Moines" block.
 *
 * - Restaurant cards link to the row's stored slug. The old card rebuilt one
 *   from the name, so "Proof's" linked to proof-s where the row says proofs.
 * - The mixed view shows one of each type that has data.
 * - The events request asks for no exact count and a small page.
 * - Type badges pass axe colour contrast.
 *
 * Runs against the fixture backend. It does not filter, so every table read
 * gets that table's rows; the overrides below add the rows this spec needs.
 */

const ISO = '2026-01-01T00:00:00Z';

function opening(i: number, name: string, slug: string) {
  return {
    id: `40000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name,
    slug,
    description: 'An opening supplied by tests/home-dashboard.spec.ts.',
    cuisine: 'American',
    price_range: '$$',
    city: 'Des Moines',
    image_url: null,
    rating: null,
    is_featured: false,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
    data_quality_score: 80,
    enhanced: false,
    google_place_id: null,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    location: 'East Village',
    merged_at: null,
    merged_into: null,
    opening: true,
    opening_date: '2026-11-01',
    opening_timeframe: null,
    phone: null,
    popularity_score: 0,
    source_url: 'https://example.com/opening',
    status: 'opening_soon',
    website: null,
    writeup_generated_at: null,
  };
}

const OPENINGS = [
  opening(0, "Proof's", 'proofs'),
  opening(1, 'Fong\'s & Co', 'fongs-and-co'),
  // A duplicate name; the stored slug carries the suffix.
  opening(2, "Proof's", 'proofs-2'),
];

const PLAYGROUNDS = [
  {
    id: '50000000-0000-0000-0000-000000000000',
    name: 'Fixture Park Playground',
    description: 'A playground supplied by tests/home-dashboard.spec.ts.',
    location: 'Des Moines, IA',
    age_range: '2-12',
    image_url: null,
    rating: null,
    is_featured: false,
    latitude: 41.58,
    longitude: -93.62,
    created_at: ISO,
    updated_at: ISO,
    accessibility_notes: null,
    amenities: [],
    has_restrooms: true,
    has_shade: true,
    source: 'manual',
    surface_type: null,
  },
];

async function json(route: Parameters<Parameters<Page['route']>[1]>[0], rows: unknown[]) {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': `0-${rows.length - 1}/${rows.length}` },
    body: JSON.stringify(rows),
  });
}

async function openDashboard(page: Page) {
  await installFixtureBackend(page);
  // Registered after the catch-all, so these win for their tables.
  await page.route('**/rest/v1/restaurants?*', (route) => {
    const url = route.request().url();
    // Only the openings query filters on status=in.(opening_soon,announced).
    return url.includes('status=in.') ? json(route, OPENINGS) : route.fallback();
  });
  await page.route('**/rest/v1/playgrounds?*', (route) => json(route, PLAYGROUNDS));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const heading = page.getByRole('heading', { name: 'This week in Des Moines' });
  // The block mounts when its LazySection nears the viewport; scroll to it.
  for (let i = 0; i < 30 && !(await heading.isVisible()); i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }
  await expect(heading).toBeVisible({ timeout: 30_000 });
  return page.locator('section[aria-labelledby="dashboard-heading"]');
}

test('restaurant cards link to the stored slug, apostrophes, ampersands and duplicates included', async ({ page }) => {
  const dashboard = await openDashboard(page);
  await dashboard.getByRole('tab', { name: 'New openings' }).click();

  await expect(dashboard.locator('a[href="/restaurants/proofs"]')).toHaveCount(1);
  await expect(dashboard.locator('a[href="/restaurants/fongs-and-co"]')).toHaveCount(1);
  await expect(dashboard.locator('a[href="/restaurants/proofs-2"]')).toHaveCount(1);
  // The browser-built slug must not appear anywhere.
  await expect(dashboard.locator('a[href="/restaurants/proof-s"]')).toHaveCount(0);
});

test('the mixed view shows one of each type that has data, with See all links', async ({ page }) => {
  const dashboard = await openDashboard(page);

  for (const group of ['Events', 'New openings', 'Attractions', 'Playgrounds']) {
    const section = dashboard.locator('section').filter({ has: page.getByRole('heading', { name: group, exact: true }) });
    await expect(section.locator('[data-card-link]').first()).toBeVisible();
  }
  await expect(dashboard.getByRole('link', { name: 'See all events' })).toHaveAttribute('href', '/events');
  // No javascript: links left over from the old pagination.
  await expect(dashboard.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('the dashboard events request asks for no exact count and a small page', async ({ page }) => {
  const eventRequests: Request[] = [];
  page.on('request', (req) => {
    if (/\/rest\/v1\/events\?/.test(req.url()) && req.method() !== 'OPTIONS') eventRequests.push(req);
  });
  await openDashboard(page);

  const dashboardRequests = eventRequests.filter((r) => r.url().includes('limit=9'));
  expect(dashboardRequests.length, 'no limit=9 events request seen').toBeGreaterThan(0);
  for (const req of dashboardRequests) {
    const prefer = (await req.allHeaders())['prefer'] ?? '';
    expect(prefer, `events request asked for a count: ${req.url()}`).not.toContain('count=exact');
  }
});

test('type badges pass colour contrast', async ({ page }) => {
  await openDashboard(page);
  const results = await new AxeBuilder({ page })
    .include('section[aria-labelledby="dashboard-heading"]')
    .withRules(['color-contrast'])
    .analyze();
  expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
});
