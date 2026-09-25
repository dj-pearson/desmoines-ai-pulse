import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore pass 2 WP3, the attraction detail page.
 *
 * 1. No Featured badge, even on a row with is_featured = true.
 * 2. The hero rating is the review average with its count, from
 *    content_rating_aggregates, and nothing when there are no reviews.
 *    attractions.rating is never printed.
 * 3. Under the prerender flag there is no status chip and no today row; at a
 *    fixed clock there are both.
 * 4. JSON-LD: openingHoursSpecification for the days the row states, and the
 *    TouristAttraction node's @id is `${url}#place`.
 * 6. Dark mode passes axe color-contrast, including the Not Found card.
 * 7. "All attractions" and "Browse all attractions" are single links, not a
 *    button inside a link.
 * 8. One Website link in the page body; "Paid admission" alone with no
 *    website; no "Est. visit time" for a type we have no estimate for, and no
 *    "How long" question in the FAQ.
 *
 * Table overrides are registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const NINE_TO_FIVE = { open: '09:00', close: '17:00' };
/** Wednesday 2026-09-23, 10:00 AM in Des Moines. */
const WED_10AM = new Date('2026-09-23T15:00:00Z');
const headers = { 'access-control-allow-origin': '*' };

function row(extra: Record<string, unknown> = {}) {
  return {
    id: '32000000-0000-0000-0000-000000000001',
    name: 'Detail Fixture Museum',
    slug: 'detail-fixture-museum',
    description: 'A museum supplied by attraction-detail.spec.ts.',
    type: 'Museum',
    location: '200 Fixture Ave, Des Moines, IA',
    address: null,
    image_url: null,
    rating: 4.87,
    is_featured: true,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.585,
    longitude: -93.63,
    website: 'https://example.com/detail-fixture',
    hours_summary: null,
    // Sunday was never entered: six days of schema, not seven.
    hours: {
      mon: NINE_TO_FIVE,
      tue: NINE_TO_FIVE,
      wed: NINE_TO_FIVE,
      thu: NINE_TO_FIVE,
      fri: NINE_TO_FIVE,
      sat: { open: '10:00', close: '16:00' },
    },
    is_indoor: true,
    is_kid_friendly: true,
    is_free: false,
    is_active: true,
    accessibility_notes: null,
    geo_summary: null,
    created_at: ISO,
    updated_at: ISO,
    ...extra,
  };
}

function fulfil(route: Route, rows: unknown[]) {
  // .single()/.maybeSingle() may ask for one object rather than an array.
  const wantsObject = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
  if (wantsObject) {
    if (rows.length === 0) {
      return route.fulfill({
        status: 406,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows[0]) });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

async function install(
  page: Page,
  detail: Record<string, unknown> | null,
  aggregate: { average_rating: number; total_ratings: number } | null = null,
) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/attractions**', (route) => {
    const url = new URL(route.request().url());
    const wanted = url.searchParams.get('slug') ?? url.searchParams.get('name') ?? '';
    if (detail && wanted.includes(String(detail.slug))) return fulfil(route, [detail]);
    return fulfil(route, []);
  });
  // The whole row: RatingSystem reads it too, through useRatings' select=*.
  const aggregateRow = aggregate && {
    id: '33000000-0000-0000-0000-000000000001',
    content_type: 'attraction',
    content_id: String(detail?.id ?? ''),
    average_rating: aggregate.average_rating,
    weighted_average: aggregate.average_rating,
    total_ratings: aggregate.total_ratings,
    rating_distribution: { '1': 0, '2': 0, '3': 2, '4': 4, '5': 6 },
    last_updated: ISO,
  };
  await page.route('**/rest/v1/content_rating_aggregates**', (route) =>
    fulfil(route, aggregateRow ? [aggregateRow] : []),
  );
}

async function touristAttraction(page: Page): Promise<Record<string, unknown>> {
  const handle = page.locator('script[type="application/ld+json"]');
  await expect
    .poll(async () => (await handle.allTextContents()).some((t) => t.includes('"TouristAttraction"')))
    .toBe(true);
  const blocks = (await handle.allTextContents()).map((t) => JSON.parse(t) as Record<string, unknown>);
  const node = blocks.find((b) => b['@type'] === 'TouristAttraction');
  if (!node) throw new Error('no TouristAttraction node');
  return node;
}

test.describe('attraction detail (explore pass 2 WP3)', () => {
  test('no Featured badge and no unsourced star; hours in JSON-LD with a #place id', async ({ page }) => {
    await page.clock.setFixedTime(WED_10AM);
    await install(page, row());

    await page.goto('/attractions/detail-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Fixture Museum' })).toBeVisible();

    await expect(page.getByText('Featured', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-review-summary]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('4.9');

    const node = await touristAttraction(page);
    expect(String(node['@id'])).toMatch(/\/attractions\/detail-fixture-museum#place$/);
    const spec = node.openingHoursSpecification as Array<Record<string, string>>;
    expect(spec).toHaveLength(6);
    expect(spec[0]).toMatchObject({ dayOfWeek: 'https://schema.org/Monday', opens: '09:00', closes: '17:00' });
    expect(String(node.description)).not.toContain('Rated');
    await expect(page.locator('meta[name="place:city"]')).toHaveCount(0);
    await expect(page.locator('meta[name="place:rating"]')).toHaveCount(0);
  });

  test('the hero shows the review average with its count', async ({ page }) => {
    await install(page, row(), { average_rating: 4.3, total_ratings: 12 });

    await page.goto('/attractions/detail-fixture-museum');
    const summary = page.locator('[data-review-summary]');
    await expect(summary).toHaveText('4.3 from 12 reviews');
    await expect(summary).toHaveAttribute('href', '#reviews');
  });

  test('at a fixed clock: status chip and today row', async ({ page }) => {
    await page.clock.setFixedTime(WED_10AM);
    await install(page, row());

    await page.goto('/attractions/detail-fixture-museum');
    await expect(page.locator('[data-attraction-status]')).toContainText('Open until 5 PM');
    await expect(page.locator('tr[aria-current="date"]')).toContainText('Wednesday');
  });

  test('under the prerender flag: no status chip, no today row', async ({ page }) => {
    await page.clock.setFixedTime(WED_10AM);
    await page.addInitScript(() => {
      (window as unknown as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
    await install(page, row());

    await page.goto('/attractions/detail-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Fixture Museum' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Monday/ })).toBeVisible();
    await expect(page.locator('[data-attraction-status]')).toHaveCount(0);
    await expect(page.locator('tr[aria-current="date"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Open until');
    await expect(page.locator('body')).not.toContainText('Closes');
  });

  test('one Website link in the body; honest admission, visit time and FAQ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await install(page, row());

    await page.goto('/attractions/detail-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Fixture Museum' })).toBeVisible();
    await expect(page.locator('a[href="https://example.com/detail-fixture"]:visible')).toHaveCount(1);
    await expect(page.getByText('Est. visit time')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('How long should I spend');
  });

  test('no website: "Paid admission" alone, and no estimate for an unknown type', async ({ page }) => {
    await install(page, row({ website: null, type: 'Escape Room', slug: 'detail-fixture-museum' }));

    await page.goto('/attractions/detail-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Detail Fixture Museum' })).toBeVisible();
    await expect(page.getByText('Paid admission', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('official site');
    await expect(page.getByText('Est. visit time')).toHaveCount(0);
  });

  test('back links are single links, not buttons inside links', async ({ page }) => {
    await install(page, row());

    await page.goto('/attractions/detail-fixture-museum');
    for (const name of ['All attractions', 'Browse all attractions']) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', '/attractions');
      await expect(link.locator('button')).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: 'Show attractions on the map' })).toHaveAttribute(
      'href',
      '/map?layers=attraction',
    );
  });

  for (const scenario of ['found', 'not found'] as const) {
    test(`dark mode passes axe color-contrast (${scenario})`, async ({ page }) => {
      await page.clock.setFixedTime(WED_10AM);
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem('dmi-theme', 'dark');
        } catch {
          /* the class check below fails instead */
        }
      });
      await install(page, scenario === 'found' ? row() : null);

      await page.goto('/attractions/detail-fixture-museum');
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .include('main')
        .exclude('header')
        .exclude('footer')
        .withRules(['color-contrast'])
        .analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
    });
  }
});
