/**
 * Restaurant detail, eat-drink pass 2 (docs/page-plans/eat-drink-pass2.md, WP3).
 *
 * Runs against tests/support/fixtureBackend.ts with per-test overrides for
 * restaurants, events and restaurant_menus (registered after it, so they win).
 * The clock is fixed at 2026-10-01 17:00 CDT so "tonight" is deterministic.
 * What these pin:
 *   - the FAQPage JSON-LD carries no editorial, rank or dollar-band claim;
 *   - Google's CLOSED_TEMPORARILY closes the page without a status change;
 *   - "Tonight nearby" sits above the FAQ at 390px and has a nav chip;
 *   - "Back to results" returns to the filtered list with its params;
 *   - stale pre-opening copy stays off the page;
 *   - a day the hours text doesn't mention reads "Not listed", not "Closed";
 *   - the title says "Menu" only when there is one;
 *   - "Jump to" on a long menu opens the section it jumps to;
 *   - signing in to claim comes back to this page.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-10-01T22:00:00Z'); // Thu 5:00 PM CDT

const BASE = {
  id: ID,
  name: 'Fixture Supper Club',
  slug: 'fixture-supper-club',
  phone: '515-555-0100',
  website: 'https://example.com/supper',
  menu_url: null,
  location: '400 Locust St, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'American',
  description: 'Steaks and relish trays since 1962.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.7,
  price_range: '$',
  opening: 'Daily 11am-10pm',
  status: 'open',
  is_featured: true,
  is_sponsored: false,
  sponsored_until: null,
  is_merged: false,
  merged_into: null,
  reservable: true,
  reservation_url: 'https://www.opentable.com/r/fixture',
  reservation_provider: 'opentable',
  updated_at: '2026-09-30T00:00:00Z',
  geo_faq: [{ question: 'Is there parking?', answer: 'It is one of the most popular spots downtown.' }],
};

/** Tonight, 8:30 PM CDT, a couple of blocks away. */
const TONIGHT_EVENT = {
  id: 'e0000000-0000-4000-8000-000000000001',
  title: 'Fixture Jazz Night',
  date: '2026-10-02T01:30:00Z',
  event_start_utc: '2026-10-02T01:30:00Z',
  event_start_local: '2026-10-01T20:30:00',
  venue: 'Fixture Hall',
  location: '500 Locust St, Des Moines, IA 50309',
  city: 'Des Moines',
  category: 'Music',
  latitude: 41.582,
  longitude: -93.621,
  time_tbd: false,
  is_hidden: false,
  is_merged: false,
  archived_at: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function setup(
  page: Page,
  row: Record<string, unknown>,
  opts: { events?: unknown[]; menus?: unknown[] } = {},
) {
  await page.clock.setFixedTime(NOW);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    const hit = url.includes(`slug=eq.${row.slug}`) || url.includes(`id=eq.${row.id}`);
    return json(route, hit ? [row] : []);
  });
  await page.route('**/rest/v1/events*', (route) => json(route, opts.events ?? []));
  await page.route('**/rest/v1/restaurant_menus*', (route) => json(route, opts.menus ?? []));
}

/** Every JSON-LD node on the page, parsed. */
async function jsonLd(page: Page): Promise<unknown[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    try {
      return [JSON.parse(b)];
    } catch {
      return [];
    }
  });
}

test.describe('restaurant detail, pass 2', () => {
  test('the FAQPage schema states facts only', async ({ page }) => {
    await setup(page, BASE);
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();

    await expect
      .poll(async () => (await jsonLd(page)).some((n) => (n as { '@type'?: string })['@type'] === 'FAQPage'))
      .toBe(true);
    const faq = JSON.stringify((await jsonLd(page)).find((n) => (n as { '@type'?: string })['@type'] === 'FAQPage'));
    for (const claim of ['editor', 'highest', 'affordable', '$15', 'popular']) {
      expect(faq.toLowerCase()).not.toContain(claim.toLowerCase());
    }
    expect(faq).toContain('Google rating 4.7 of 5.');
    // geo_faq is on the page, labelled, and not in the schema.
    await expect(page.getByRole('heading', { name: 'AI-assisted answers' })).toBeVisible();
    expect(faq).not.toContain('Is there parking?');
    // is_featured alone earns no badge.
    await expect(page.getByText(/^Featured$/)).toHaveCount(0);
    await expect(page.getByText(/Editor's Pick/i)).toHaveCount(0);
  });

  test("Google's CLOSED_TEMPORARILY closes the page", async ({ page }) => {
    await setup(page, { ...BASE, business_status: 'CLOSED_TEMPORARILY' }, { events: [TONIGHT_EVENT] });
    await page.goto(`/restaurants/${BASE.slug}`);

    await expect(page.getByText(/is temporarily closed/i).first()).toBeVisible();
    await expect(page.getByText(/^Open Now$/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Reserve/i })).toHaveCount(0);
    await expect(page.locator('#tonight')).toHaveCount(0);
    await expect(page.getByText(/Own this business/i)).toHaveCount(0);
  });

  test('tonight nearby sits above the FAQ at 390px, with a nav chip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, BASE, { events: [TONIGHT_EVENT] });
    await page.goto(`/restaurants/${BASE.slug}`);

    const tonight = page.locator('#tonight');
    await expect(tonight).toBeVisible();
    await expect(tonight).toContainText('Fixture Jazz Night');
    await expect(tonight).toContainText('Open until 10 PM CT');
    await expect(page.getByRole('navigation', { name: 'Page sections' }).getByRole('link', { name: 'Tonight nearby' })).toHaveAttribute('href', '#tonight');

    const tonightBox = await tonight.boundingBox();
    const faqBox = await page.locator('#faq').boundingBox();
    expect(tonightBox && faqBox && tonightBox.y < faqBox.y).toBe(true);
  });

  test('"Back to results" returns to the filtered list', async ({ page }) => {
    await setup(page, BASE);
    const from = '/restaurants?cuisine=Mexican&page=2';
    // Arrive the way a card link does: a client-side navigation carrying
    // state.from. React Router keeps user state under history.state.usr.
    await page.goto('/');
    await page.evaluate(
      ({ path, from }) => {
        window.history.pushState({ usr: { from }, key: 'fixture', idx: 1 }, '', path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
      },
      { path: `/restaurants/${BASE.slug}`, from },
    );
    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();

    const back = page.getByRole('link', { name: 'Back to results' });
    await expect(back).toHaveAttribute('href', from);
    await back.click();
    await expect(page).toHaveURL(/\/restaurants\?cuisine=Mexican&page=2$/);
  });

  test('without a results origin the control reads "All restaurants"', async ({ page }) => {
    await setup(page, BASE);
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page.getByRole('link', { name: 'All restaurants' }).first()).toHaveAttribute('href', '/restaurants');
    await expect(page.getByRole('link', { name: 'Back to results' })).toHaveCount(0);
  });

  test('stale pre-opening copy stays off an open place', async ({ page }) => {
    await setup(page, { ...BASE, description: 'Coming soon to downtown Des Moines!' });
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: BASE.name })).toBeVisible();
    await expect(page.getByText(/Coming soon to downtown/)).toHaveCount(0);
    const node = (await jsonLd(page)).find((n) => (n as { '@type'?: string })['@type'] === 'Restaurant');
    expect(JSON.stringify(node ?? {})).not.toContain('Coming soon');
  });

  test('a day the hours text does not mention reads "Not listed"', async ({ page }) => {
    await setup(page, { ...BASE, opening: 'Mon-Fri 11am-9pm' });
    await page.goto(`/restaurants/${BASE.slug}`);
    const saturday = page.locator('#hours tr', { hasText: 'Saturday' });
    await expect(saturday).toContainText('Not listed');
    await expect(saturday).not.toContainText('Closed');
  });

  test('the title promises a menu only when there is one', async ({ page }) => {
    await setup(page, BASE);
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page).toHaveTitle(/Hours & Reviews/);
    await expect(page).not.toHaveTitle(/Menu/);
  });

  test('Jump to opens a collapsed menu section, and the menu says when it was captured', async ({ page }) => {
    const sections = ['Starters', 'Steaks', 'Desserts'];
    const items = sections.flatMap((section, s) =>
      Array.from({ length: 11 }, (_, i) => ({
        id: `m-${s}-${i}`,
        menu_id: 'menu-1',
        section_name: section,
        section_sort_order: s,
        item_name: `${section} item ${i + 1}`,
        item_description: null,
        price: `$${10 + i}`,
        price_numeric: 10 + i,
        dietary_tags: [],
        is_popular: false,
        sort_order: i,
      })),
    );
    const menu = {
      id: 'menu-1',
      restaurant_id: ID,
      version: 1,
      is_current: true,
      source_type: 'scraped',
      source_url: 'https://example.com/supper/menu',
      captured_at: '2026-08-03T15:00:00Z',
      notes: null,
      created_at: '2026-08-03T15:00:00Z',
      restaurant_menu_items: items,
    };
    await setup(page, BASE, { menus: [menu] });
    await page.goto(`/restaurants/${BASE.slug}`);

    const menuSection = page.locator('section#menu');
    await expect(menuSection).toContainText('Menu captured from their site on August 3, 2026');
    await expect(page.getByText('Desserts item 1')).toHaveCount(0);
    await menuSection.getByRole('button', { name: /^Desserts \(11\)$/ }).click();
    await expect(page.getByText('Desserts item 1', { exact: true })).toBeVisible();
    // No hidden duplicate of the menu for crawlers.
    await expect(menuSection.locator('.sr-only[aria-hidden="true"]')).toHaveCount(0);
    // With a captured menu the title may say so.
    await expect(page).toHaveTitle(/Menu/);
  });

  test('signing in to claim comes back to this page', async ({ page }) => {
    await setup(page, BASE);
    await page.goto(`/restaurants/${BASE.slug}`);
    await expect(page.getByRole('link', { name: 'Sign in to claim' })).toHaveAttribute(
      'href',
      `/auth?redirect=${encodeURIComponent(`/restaurants/${BASE.slug}`)}`,
    );
  });
});
