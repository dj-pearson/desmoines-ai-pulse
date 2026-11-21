/**
 * A closed restaurant's page (WEB-UX-089).
 *
 * Runs against tests/support/fixtureBackend.ts with the restaurants and
 * restaurant_menus reads overridden per test. The detail read gets the one
 * row; the nearby scan (the bounding-box read) gets three open neighbours.
 * What these pin, at 390px:
 *   - a place closed for good still answers 200, with a muted hero and the
 *     closed notice above the fold;
 *   - Website, Menu, Reserve, Call and Rate are gone, from the action bar and
 *     the sticky mobile bar, and so is the captured menu;
 *   - its Restaurant JSON-LD has no hasMenu, makesOffer or opening hours, and
 *     there is no Menu node;
 *   - open places nearby sit directly under the notice, for a temporary
 *     closure too.
 * The open-row test is the counter-assertion: the same row, open, shows every
 * action and the menu, so the closed tests cannot pass on a page that renders
 * nothing.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { fixtureRestaurants, installFixtureBackend } from './support/fixtureBackend';

const ID = '88888888-8888-4888-8888-888888888888';

const BASE = {
  id: ID,
  name: 'Fixture Chop House',
  slug: 'fixture-chop-house',
  phone: '515-555-0199',
  website: 'https://example.com/chop',
  menu_url: 'https://example.com/chop/menu',
  location: '400 Locust St, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'American',
  description: 'Steaks and chops downtown.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.5,
  price_range: '$$',
  opening: 'Daily 11am-10pm',
  status: 'open',
  business_status: null,
  is_merged: false,
  merged_into: null,
  reservable: true,
  reservation_url: 'https://www.opentable.com/r/chop',
  reservation_provider: 'opentable',
  updated_at: '2026-09-30T00:00:00Z',
};

const MENU = {
  id: 'menu-chop',
  restaurant_id: ID,
  version: 1,
  is_current: true,
  source_type: 'scraped',
  source_url: 'https://example.com/chop/menu',
  captured_at: '2026-08-03T15:00:00Z',
  notes: null,
  created_at: '2026-08-03T15:00:00Z',
  restaurant_menu_items: [
    {
      id: 'mi-1',
      menu_id: 'menu-chop',
      section_name: 'Steaks',
      section_sort_order: 0,
      item_name: 'Fixture Ribeye',
      item_description: null,
      price: '$42',
      price_numeric: 42,
      dietary_tags: [],
      is_popular: false,
      sort_order: 0,
    },
  ],
};

/** Three open places in the same block, from the shared fixture rows. */
const NEIGHBOURS = fixtureRestaurants().slice(1, 4);

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function setup(page: Page, row: Record<string, unknown>) {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes(`slug=eq.${row.slug}`) || url.includes(`id=eq.${row.id}`)) return json(route, [row]);
    // The nearby scan is a bounding box around the page's coordinates.
    if (url.includes('latitude=gte.')) return json(route, NEIGHBOURS);
    return json(route, []);
  });
  await page.route('**/rest/v1/restaurant_menus*', (route) => json(route, [MENU]));
}

/** Every JSON-LD node on the page, parsed. */
async function jsonLd(page: Page): Promise<Array<Record<string, unknown>>> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    try {
      return [JSON.parse(b) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

async function restaurantNode(page: Page): Promise<Record<string, unknown>> {
  await expect
    .poll(async () => (await jsonLd(page)).some((n) => n['@type'] === 'Restaurant'))
    .toBe(true);
  return (await jsonLd(page)).find((n) => n['@type'] === 'Restaurant') ?? {};
}

test.describe('closed restaurant page', () => {
  test('control: the same place, open, shows every action and its menu', async ({ page }) => {
    await setup(page, BASE);
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();

    await expect(page.getByRole('link', { name: /^Website$/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Call$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Reserve/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rate this place' })).toBeVisible();
    await expect(page.locator('a[href="#menu"]').first()).toBeVisible();
    await expect(page.locator('section#menu')).toContainText('Fixture Ribeye');
    await expect(page.getByRole('toolbar', { name: 'Quick actions' })).toHaveCount(1);
    await expect(page.locator('[data-hero-state]')).toHaveAttribute('data-hero-state', 'live');
    await expect(page.getByRole('heading', { name: 'Open within 2 miles' })).toHaveCount(0);

    const node = await restaurantNode(page);
    expect(node).toHaveProperty('hasMenu');
    expect(node).toHaveProperty('openingHoursSpecification');
  });

  test('a place closed for good hides every action and its menu, and says so above the fold', async ({ page }) => {
    await setup(page, { ...BASE, status: 'closed' });
    const response = await page.goto(`/restaurants/${BASE.slug}`);
    // Old links keep working.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();

    const notice = page.getByRole('note').filter({ hasText: 'has closed permanently' });
    await expect(notice).toBeVisible();
    const box = await notice.boundingBox();
    expect(box, 'the closed notice has a box').not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await expect(page.locator('[data-hero-state]')).toHaveAttribute('data-hero-state', 'muted');

    await expect(page.getByRole('link', { name: /^Website$/ })).toHaveCount(0);
    await expect(page.locator('a[href="https://example.com/chop"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Menu/ })).toHaveCount(0);
    await expect(page.locator('a[href="#menu"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Reserve/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Call$/ })).toHaveCount(0);
    // Its own number. The open places listed nearby are restaurant cards, and
    // since WEB-UX-087 a card has its own Call link; those must stay.
    await expect(page.locator(`a[href="tel:${BASE.phone}"]`)).toHaveCount(0);
    await expect(page.getByRole('link', { name: `Call ${NEIGHBOURS[0].name}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rate this place' })).toHaveCount(0);
    await expect(page.locator('#reviews')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Quick actions' })).toHaveCount(0);
    await expect(page.locator('section#menu')).toHaveCount(0);
    await expect(page.getByText('Fixture Ribeye')).toHaveCount(0);

    const node = await restaurantNode(page);
    expect(node).not.toHaveProperty('hasMenu');
    expect(node).not.toHaveProperty('makesOffer');
    expect(node).not.toHaveProperty('openingHoursSpecification');
    expect(node).not.toHaveProperty('acceptsReservations');
    expect((await jsonLd(page)).some((n) => n['@type'] === 'Menu')).toBe(false);
  });

  for (const [label, row] of [
    ['closed for good', { status: 'closed' }],
    ['temporarily closed', { business_status: 'CLOSED_TEMPORARILY' }],
  ] as const) {
    test(`a ${label} place lists open places nearby directly under the notice`, async ({ page }) => {
      await setup(page, { ...BASE, ...row });
      await page.goto(`/restaurants/${BASE.slug}`);

      const notice = page.getByRole('note').filter({ hasText: /closed/ });
      await expect(notice).toBeVisible();
      const rail = page.getByRole('heading', { name: 'Open within 2 miles' });
      await expect(rail).toBeVisible();
      await expect(page.getByText(NEIGHBOURS[0].name).first()).toBeVisible();

      // Under the notice, and above everything else on the page: the
      // at-a-glance facts and the Location heading both come after it.
      const noticeBox = await notice.boundingBox();
      const railBox = await rail.boundingBox();
      const locationBox = await page.getByRole('heading', { name: /Location & Contact/ }).boundingBox();
      expect(noticeBox && railBox && locationBox).toBeTruthy();
      expect(railBox!.y).toBeGreaterThan(noticeBox!.y + noticeBox!.height - 1);
      expect(railBox!.y).toBeLessThan(locationBox!.y);
      // One restaurant rail: the bottom one is not also drawn.
      await expect(page.getByRole('heading', { name: 'Also within 2 miles' })).toHaveCount(0);
      await expect(page.locator('[data-hero-state]')).toHaveAttribute('data-hero-state', 'muted');
    });
  }
});
