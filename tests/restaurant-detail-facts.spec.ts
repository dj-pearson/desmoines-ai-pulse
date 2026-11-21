/**
 * Each fact once on a phone (WEB-UX-088).
 *
 * The restaurant page used to print the address three times, the phone four,
 * Directions three, the rating three and the cuisine four: the hero, the
 * at-a-glance list, a quick-action row, a "Restaurant Details" tile grid, and
 * a summary paragraph written for crawlers. On a phone it also stacked a
 * wrapping row of buttons and a wrapping row of section chips above the hours,
 * while Reserve and Directions were already pinned in the sticky bar.
 *
 * At 390x844 with one fixture row these pin:
 *   - each fact is visible once in the body, plus once in the sticky bar for
 *     the ones it offers (Reserve, Directions);
 *   - the quick-action row leaves out what the sticky bar offers, and the
 *     section nav is one row that scrolls sideways;
 *   - today's hours and the open or closed state sit on the first screen,
 *     above the sticky bar, both while open and while closed;
 *   - the Restaurant JSON-LD is the node the page published before the change.
 * The desktop test is the counter-assertion: the sticky bar is not drawn at
 * 1280px, so the same row's Reserve and Directions come back in the body.
 */
import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const ID = '99999999-9999-4999-8999-999999999088';
const OPEN_AT = new Date('2026-10-01T22:00:00Z'); // Thu 5:00 PM CDT
const CLOSED_AT = new Date('2026-10-01T12:00:00Z'); // Thu 7:00 AM CDT

const ROW = {
  id: ID,
  name: 'Fixture Txoko',
  slug: 'fixture-txoko',
  phone: '515-555-0142',
  website: 'https://example.com/txoko',
  menu_url: 'https://example.com/txoko/menu',
  location: '1225 Fixture Ave, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'Basque',
  description: 'Pintxos and a long wooden bar.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.3,
  google_review_count: 87,
  google_rating_checked_at: '2026-09-20T15:00:00Z',
  price_range: '$$',
  opening: 'Daily 11am-10pm',
  status: 'open',
  business_status: null,
  is_featured: false,
  is_sponsored: false,
  sponsored_until: null,
  is_merged: false,
  merged_into: null,
  reservable: true,
  reservation_url: 'https://www.opentable.com/r/txoko',
  reservation_provider: 'opentable',
  updated_at: '2026-09-30T00:00:00Z',
};

/**
 * The Restaurant node this row produced before WEB-UX-088, read off a preview
 * build of 4403448. The change removed visible copy only; the schema must not
 * move with it.
 */
const RESTAURANT_NODE_BEFORE = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  '@id': 'https://desmoinesinsider.com/restaurants/fixture-txoko',
  name: 'Fixture Txoko',
  description: 'Pintxos and a long wooden bar.',
  servesCuisine: 'Basque',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '1225 Fixture Ave',
    addressLocality: 'Des Moines',
    addressRegion: 'IA',
    postalCode: '50309',
    addressCountry: 'US',
  },
  telephone: '515-555-0142',
  url: 'https://desmoinesinsider.com/restaurants/fixture-txoko',
  sameAs: ['https://example.com/txoko'],
  hasMenu: 'https://example.com/txoko/menu',
  acceptsReservations: 'https://www.opentable.com/r/txoko',
  priceRange: '$$',
  geo: { '@type': 'GeoCoordinates', latitude: 41.58, longitude: -93.62 },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '11:00',
      closes: '22:00',
    },
  ],
  currenciesAccepted: 'USD',
  areaServed: { '@type': 'City', name: 'Des Moines', containedInPlace: { '@type': 'State', name: 'Iowa' } },
};

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function setup(page: Page, now: Date, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(now);
  await installFixtureBackend(page);
  // Only this row: neighbours would bring their own phones and ratings.
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    const hit = url.includes(`slug=eq.${ROW.slug}`) || url.includes(`id=eq.${ROW.id}`);
    return json(route, hit ? [ROW] : []);
  });
  await page.route('**/rest/v1/restaurant_menus*', (route) => json(route, []));
  await page.route('**/rest/v1/events*', (route) => json(route, []));
  await page.goto(`/restaurants/${ROW.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: ROW.name })).toBeVisible();
}

interface Placement {
  body: number;
  sticky: number;
}

/**
 * Where a locator's visible matches are: in the sticky bar, or in the body.
 * The breadcrumb trail is left out: it is navigation, and its cuisine crumb
 * is a link to the filtered list rather than a restated fact.
 */
async function placement(target: Locator): Promise<Placement> {
  return target.evaluateAll((els) => {
    const out = { body: 0, sticky: 0 };
    for (const el of els as HTMLElement[]) {
      // checkVisibility, not a box test: an FAQ answer inside a closed
      // <details> keeps a laid-out box but is not shown.
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      if (el.closest('nav[aria-label="Breadcrumb"]')) continue;
      if (el.closest('[role="toolbar"][aria-label="Quick actions"]')) out.sticky += 1;
      else out.body += 1;
    }
    return out;
  });
}

/** True when the element ends above the sticky bar, i.e. on the first screen. */
async function onFirstScreen(page: Page, target: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  const bar = await page.getByRole('toolbar', { name: 'Quick actions' }).boundingBox();
  if (!box || !bar) return false;
  return box.y >= 0 && box.y + box.height <= bar.y;
}

async function restaurantNode(page: Page): Promise<Record<string, unknown>> {
  const read = async () =>
    (await page.locator('script[type="application/ld+json"]').allTextContents())
      .flatMap((b) => {
        try {
          return [JSON.parse(b) as Record<string, unknown>];
        } catch {
          return [];
        }
      })
      .find((n) => n['@type'] === 'Restaurant');
  await expect.poll(async () => !!(await read())).toBe(true);
  return (await read()) ?? {};
}

test.describe('restaurant detail, each fact once (WEB-UX-088)', () => {
  test('at 390px each fact is shown once in the body, plus the sticky bar', async ({ page }) => {
    await setup(page, OPEN_AT);

    expect(await placement(page.getByText('1225 Fixture Ave')), 'address').toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByText('515-555-0142')), 'phone number').toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.locator(`a[href="tel:${ROW.phone}"]`)), 'call links').toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByRole('link', { name: /Directions/ })), 'directions').toEqual({ body: 0, sticky: 1 });
    expect(await placement(page.getByText('4.3', { exact: true })), 'rating').toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByText(/Basque/)), 'cuisine').toEqual({ body: 1, sticky: 0 });
    // Reserve is the sticky bar's primary action, so the row leaves it out.
    expect(await placement(page.getByRole('link', { name: /Reserve a table/i })), 'reserve').toEqual({
      body: 0,
      sticky: 1,
    });

    // The tile grid and the crawler paragraph are gone.
    await expect(page.getByRole('heading', { name: 'Restaurant Details' })).toHaveCount(0);
    await expect(page.getByText(/is a Basque restaurant located at/)).toHaveCount(0);
    // What the row still offers on a phone: things the bar does not.
    await expect(page.getByRole('link', { name: 'Website' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rate this place' })).toBeVisible();
    // The rating keeps its count and check date, in one place.
    await expect(page.getByText('Rating from Google, 87 reviews, checked September 20, 2026')).toBeVisible();
  });

  test('the section nav is one row that scrolls sideways', async ({ page }) => {
    await setup(page, OPEN_AT);
    const nav = page.getByRole('navigation', { name: 'Page sections' });
    const tops = await nav
      .getByRole('link')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops.length).toBeGreaterThan(3);
    expect(new Set(tops).size, `chip tops ${tops.join(',')}`).toBe(1);
    const { scrollWidth, clientWidth } = await nav.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    // The page itself does not scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  for (const [label, now, state] of [
    ['open', OPEN_AT, 'Open Now'],
    ['closed', CLOSED_AT, 'Closed now'],
  ] as const) {
    test(`while ${label}, today's hours and the state are on the first screen`, async ({ page }) => {
      await setup(page, now);
      const badge = page.locator('[data-hero-state]').getByText(state, { exact: true });
      await expect(badge).toBeVisible();
      expect(await onFirstScreen(page, badge), `${state} badge above the sticky bar`).toBe(true);
      const hours = page.getByText('Open 11 AM to 10 PM on Thursdays');
      await expect(hours).toBeVisible();
      expect(await onFirstScreen(page, hours), "today's hours above the sticky bar").toBe(true);
    });
  }

  test('the Restaurant JSON-LD is the node the page published before the change', async ({ page }) => {
    await setup(page, OPEN_AT);
    expect(await restaurantNode(page)).toEqual(RESTAURANT_NODE_BEFORE);
  });

  test('control: at 1280px there is no sticky bar, so Reserve and Directions are in the body', async ({ page }) => {
    await setup(page, OPEN_AT, { width: 1280, height: 900 });
    await expect(page.getByRole('toolbar', { name: 'Quick actions' })).toBeHidden();
    expect(await placement(page.getByRole('link', { name: /Directions/ }))).toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByRole('link', { name: /Reserve a table/i }))).toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByText('1225 Fixture Ave'))).toEqual({ body: 1, sticky: 0 });
    expect(await placement(page.getByText('4.3', { exact: true }))).toEqual({ body: 1, sticky: 0 });
  });
});
