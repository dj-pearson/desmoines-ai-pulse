import { test, expect, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-SEO-051: /itineraries/:slug draws a breadcrumb (Home / Itineraries /
 * title) and publishes a BreadcrumbList naming the same pages in the same
 * order. It used to have a bare back link and no trail in its JSON-LD.
 *
 * The fixture backend does not filter, so curated_itineraries is answered with
 * page.route AFTER installFixtureBackend, which wins the match.
 */

const ISO = '2026-09-01T00:00:00Z';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };

const DATE_NIGHT = {
  id: '73000000-0000-0000-0000-000000000001',
  title: 'Date Night in the East Village',
  slug: 'east-village-date-night',
  description: 'Dinner, a show and a walk along the river.',
  duration: 'half-day',
  theme: 'romance',
  cover_image: null,
  stops: [
    { order: 1, entity_type: 'restaurant', name: 'Fixture Bistro', description: 'Dinner first.', time_suggestion: '6:00 PM', tips: 'Book ahead.' },
    { order: 2, entity_type: 'attraction', name: 'Fixture Riverwalk', description: 'A walk after.', time_suggestion: '8:30 PM', tips: '' },
  ],
  seo_title: null,
  seo_description: null,
  is_published: true,
  created_at: ISO,
  updated_at: ISO,
};

function answer(route: Route, rows: unknown[]) {
  const headers = { ...CORS, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  if ((route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object')) {
    return rows.length > 0
      ? route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows[0]) })
      : route.fulfill({
          status: 406,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
        });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

test.describe('/itineraries/:slug', () => {
  test('the breadcrumb nav and the BreadcrumbList name the same pages', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/curated_itineraries?**', (route) => answer(route, [DATE_NIGHT]));
    await page.goto('/itineraries/east-village-date-night');

    await expect(page.getByRole('heading', { level: 1, name: DATE_NIGHT.title })).toBeVisible({ timeout: 30_000 });

    const expected: Array<[string, string]> = [
      ['Home', '/'],
      ['Itineraries', '/itineraries'],
      [DATE_NIGHT.title, '/itineraries/east-village-date-night'],
    ];

    const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(nav).toBeVisible();
    const visible = (await nav.locator('li:not([aria-hidden="true"])').allInnerTexts()).map((t) => t.trim());
    expect(visible).toEqual(expected.map(([name]) => name));
    await expect(nav.locator('[aria-current="page"]')).toHaveText(DATE_NIGHT.title);
    await expect(nav.getByRole('link', { name: 'Itineraries' })).toHaveAttribute('href', '/itineraries');

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const nodes = blocks.map((b) => JSON.parse(b));
    const lists = nodes.filter((node) => node['@type'] === 'BreadcrumbList');
    expect(lists, 'exactly one BreadcrumbList').toHaveLength(1);
    const items = lists[0].itemListElement as Array<{ position: number; name: string; item: string }>;
    expect(items.map((i) => i.name)).toEqual(expected.map(([name]) => name));
    expect(items.map((i) => i.position)).toEqual(expected.map((_, i) => i + 1));
    expect(items.map((i) => new URL(i.item).pathname)).toEqual(expected.map(([, path]) => path));

    // The TouristTrip node is still there beside it.
    expect(nodes.some((node) => node['@type'] === 'TouristTrip'), 'no TouristTrip JSON-LD').toBe(true);

    // Screen only, as the back link it replaced was.
    await page.emulateMedia({ media: 'print' });
    await expect(nav).toBeHidden();
  });
});
