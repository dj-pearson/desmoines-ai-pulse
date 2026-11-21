import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { fixtureRestaurants, installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-UX-087: the restaurant card on a phone.
 *
 * The stacked card was 419px tall at 390px wide, so a phone showed about one
 * and a half, and it took a phone and coordinates and offered neither. Below
 * sm it is now a row (thumbnail, name, status, price, city, cuisine, rating)
 * with Call and Directions, and from sm up it is the stacked card.
 *
 * Rows come from tests/support/fixtureBackend: twelve restaurants, each with
 * a phone, coordinates and location "Des Moines". The hub reads them through
 * get_rotated_restaurants; a search (?q=) reads the restaurants table, which
 * the tests below answer themselves where they need a particular row.
 */

const CARD = 'article:has(h3 a[href^="/restaurants/"])';

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  // A count-only read is a HEAD request and must not get a body.
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

type Row = ReturnType<typeof fixtureRestaurants>[number];

/** Search results with the given rows in place of the first fixture rows. */
async function searchWith(page: Page, overrides: Partial<Row>[]) {
  const rows = fixtureRestaurants().map((row, i) => ({ ...row, ...(overrides[i] ?? {}) }));
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, rows));
  await page.goto('/restaurants?q=fixture');
  await expect(page.locator(CARD).first()).toBeVisible();
}

function card(page: Page, name: string): Locator {
  return page.locator(CARD).filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });
}

/** Is the action itself what a tap at its centre lands on (not the card's stretched link)? */
function hitsItself(action: Locator) {
  return action.evaluate((el) => {
    // elementFromPoint only sees the viewport, and clear of the sticky header.
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
}

test.describe('restaurant card on a phone (WEB-UX-087)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('three rows fit on one 390x844 screen', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/restaurants');
    const cards = page.locator(CARD);
    await expect(cards.nth(2)).toBeVisible();

    const boxes = await cards.evaluateAll((els) =>
      els.slice(0, 3).map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, height: r.height };
      }),
    );
    // The stacked card alone was 419px. Three rows and their gaps have to fit
    // with room left for the sticky header above them.
    const span = boxes[2].bottom - boxes[0].top;
    expect(span, 'px from the top of row 1 to the bottom of row 3').toBeLessThan(844 * 0.75);
    for (const b of boxes) expect(b.height, 'row height').toBeLessThan(180);

    // And on screen together, not merely short on paper.
    await cards.first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await cards.nth(1).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toBeInViewport({ ratio: 1 });
  });

  test('a row shows name, status line, cuisine and rating, and no description', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/restaurants');
    const first = page.locator(CARD).first();
    await expect(first).toBeVisible();

    await expect(first.getByText('$$', { exact: true })).toBeVisible();
    await expect(first.getByText('Des Moines', { exact: true })).toBeVisible();
    await expect(first.getByText(/^(American|Italian)$/)).toBeVisible();
    expect(await first.textContent()).toContain('4.4');
    await expect(first.getByText('A restaurant supplied by tests/support/fixtureBackend.')).toBeHidden();

    // Thumbnail beside the text, not above it.
    const thumb = first.locator('> div').first();
    const name = first.getByRole('heading', { level: 3 });
    const t = (await thumb.boundingBox())!;
    const n = (await name.boundingBox())!;
    expect(t.width).toBeLessThan(120);
    expect(n.x).toBeGreaterThan(t.x + t.width - 1);
  });

  test('Call and Directions are 44px links above the stretched card link', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/restaurants');
    const first = page.locator(CARD).first();
    const name = (await first.getByRole('heading', { level: 3 }).textContent())!.trim();

    const call = first.getByRole('link', { name: `Call ${name}` });
    const directions = first.getByRole('link', { name: `Directions to ${name}` });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute('href', 'tel:515-555-0100');
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=41.58,-93.62');

    for (const action of [call, directions]) {
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await hitsItself(action), 'a tap on the action reaches the action').toBe(true);
    }

    // Counter-check: a tap elsewhere on the row still reaches the card link.
    const cuisine = first.getByText(/^(American|Italian)$/);
    const hit = await cuisine.evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return at?.closest('a')?.getAttribute('href') ?? null;
    });
    expect(hit).toMatch(/^\/restaurants\//);
  });

  test('no action without the data for it', async ({ page }) => {
    await searchWith(page, [
      { name: 'No Contact Place', phone: null, latitude: null, longitude: null, location: 'Des Moines' } as Partial<Row>,
      {
        name: 'Street Only Place',
        phone: null,
        latitude: null,
        longitude: null,
        location: '210 Court Ave, Des Moines, IA 50309',
      } as Partial<Row>,
    ]);

    const none = card(page, 'No Contact Place');
    await expect(none).toBeVisible();
    await expect(none.getByRole('link', { name: /^Call / })).toHaveCount(0);
    await expect(none.getByRole('link', { name: /^Directions to / })).toHaveCount(0);

    const street = card(page, 'Street Only Place');
    await expect(street.getByRole('link', { name: /^Call / })).toHaveCount(0);
    await expect(street.getByRole('link', { name: 'Directions to Street Only Place' })).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('210 Court Ave, Des Moines')}`,
    );
  });

  test('a closed place in search results: muted image, no stars, no Call', async ({ page }) => {
    await searchWith(page, [
      { name: 'Gone For Good Grill', business_status: 'CLOSED_PERMANENTLY' } as Partial<Row>,
      { name: 'Back Soon Bistro', business_status: 'CLOSED_TEMPORARILY' } as Partial<Row>,
    ]);

    const gone = card(page, 'Gone For Good Grill');
    await expect(gone).toBeVisible();
    await expect(gone.getByText('Permanently closed')).toBeVisible();
    await expect(gone.getByText(/Rated/)).toHaveCount(0);
    await expect(gone.getByRole('link', { name: /^Call / })).toHaveCount(0);
    await expect(gone.getByRole('link', { name: /^Directions to / })).toHaveCount(0);
    expect(await gone.locator('> div').first().evaluate((e) => getComputedStyle(e).filter)).toContain('grayscale');

    const soon = card(page, 'Back Soon Bistro');
    await expect(soon.getByText('Temporarily closed')).toBeVisible();
    await expect(soon.getByText(/Rated/)).toHaveCount(0);
    await expect(soon.getByRole('link', { name: /^Call / })).toHaveCount(0);
    await expect(soon.getByRole('link', { name: 'Directions to Back Soon Bistro' })).toBeVisible();

    // Counter-check on the same page: an open place keeps its stars and Call.
    const open = card(page, 'Fixture Restaurant 2');
    await expect(open.getByText(/Rated/)).toHaveCount(1);
    await expect(open.getByRole('link', { name: 'Call Fixture Restaurant 2' })).toBeVisible();
    expect(await open.locator('> div').first().evaluate((e) => getComputedStyle(e).filter)).toBe('none');
  });
});

test.describe('restaurant card on a desktop (WEB-UX-087)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('stays a stacked card, with the street once and the city once', async ({ page }) => {
    await searchWith(page, [
      { name: 'Court Avenue Diner', location: '210 Court Ave, Des Moines, IA 50309' } as Partial<Row>,
    ]);
    const diner = card(page, 'Court Avenue Diner');
    await expect(diner).toBeVisible();

    // Image above the name, full card width.
    const thumb = (await diner.locator('> div').first().boundingBox())!;
    const name = (await diner.getByRole('heading', { level: 3 }).boundingBox())!;
    expect(thumb.height).toBeGreaterThan(150);
    expect(name.y).toBeGreaterThan(thumb.y + thumb.height - 1);

    await expect(diner.getByText('210 Court Ave', { exact: true })).toBeVisible();
    const text = (await diner.textContent()) ?? '';
    expect(text.match(/Des Moines/g)?.length, 'times the city is printed').toBe(1);
    await expect(diner.getByRole('link', { name: 'Call Court Avenue Diner' })).toBeVisible();
  });
});
