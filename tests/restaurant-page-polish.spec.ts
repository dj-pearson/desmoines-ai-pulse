/**
 * Restaurant page polish (WEB-UX-090), at 390px on fixtureBackend.
 *   - a very long name stays out of the badge row at the top of the hero
 *     (smaller on phones, three lines at most);
 *   - the hero card uses a 16px radius.
 * Counter-assertion: a short name renders on one line, so the clamp is not
 * simply hiding the heading.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const BASE = {
  id: '66666666-6666-4666-8666-666666666666',
  slug: 'fixture-long-name',
  location: '600 Grand Ave, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'American',
  description: 'Food.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: null,
  price_range: null,
  opening: null,
  status: 'open',
  business_status: 'OPERATIONAL',
  is_merged: false,
  merged_into: null,
  updated_at: '2026-09-30T00:00:00Z',
};

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function open(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureBackend(page);
  const row = { ...BASE, name };
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    return url.includes(`slug=eq.${row.slug}`) ? json(route, [row]) : json(route, []);
  });
  await page.goto(`/restaurants/${row.slug}`);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  return h1;
}

test.describe('restaurant page polish (WEB-UX-090)', () => {
  test('a very long name stays clear of the hero badge row', async ({ page }) => {
    const long = 'The Extraordinarily Long Named Neighborhood Family Restaurant Bar Grill and Late Night Kitchen of Des Moines';
    const h1 = await open(page, long);
    const hero = page.locator('[data-hero-state]');
    const heroBox = (await hero.boundingBox())!;
    const h1Box = (await h1.boundingBox())!;
    const lineHeight = await h1.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(h1Box.height, 'at most three lines').toBeLessThanOrEqual(lineHeight * 3 + 2);
    // The status badges sit in the top 56px of the hero.
    expect(h1Box.y - heroBox.y).toBeGreaterThan(56);
    const radius = await page
      .locator('[data-hero-state]')
      .evaluate((el) => parseFloat(getComputedStyle(el.closest('.rounded-2xl') ?? el).borderTopLeftRadius));
    expect(radius).toBe(16);
  });

  test('control: a short name is one line', async ({ page }) => {
    const h1 = await open(page, 'Short Name');
    const lineHeight = await h1.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await h1.boundingBox())!.height).toBeLessThanOrEqual(lineHeight + 2);
  });
});
