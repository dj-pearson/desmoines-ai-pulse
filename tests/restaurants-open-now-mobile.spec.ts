import { test, expect, type Page, type Route } from '@playwright/test';
import { fixtureRestaurants, installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-UX-084: on a phone, /restaurants/open-now puts an open restaurant on
 * the first screen. The filter form used to be fully expanded (three selects,
 * two toggles, two chip groups and a dish search, about 1,100px) above the
 * list. Now a phone gets one row (Open at, Near me, Filters with a count),
 * the rest sits in a sheet, and the active filters show as removable chips.
 *
 * Rows come from tests/support/fixtureBackend with listed hours added, and
 * the clock is pinned so every row is open.
 */

/** Thu 2026-09-24 20:00 CDT. */
const EVENING = new Date('2026-09-25T01:00:00Z');

const ROWS = fixtureRestaurants().map((row) => ({ ...row, opening: 'Daily 7am-11pm' }));

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

async function setup(page: Page) {
  await page.clock.setFixedTime(EVENING);
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, ROWS));
}

test.describe('/restaurants/open-now on a phone (WEB-UX-084)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the first open restaurant is on the first screen', async ({ page }) => {
    await setup(page);
    await page.goto('/restaurants/open-now');

    const firstCard = page.locator('[data-open-now-card]').first();
    await expect(firstCard).toBeVisible();
    // No scrolling: the page is still at the top when we measure.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(firstCard).toBeInViewport();
    // Its top edge, not a sliver: the card must start above the fold with
    // room for the name, not merely intersect the last pixel row.
    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(844 - 200);

    // The secondary filters are behind the Filters button, not on the page.
    await expect(page.getByLabel('Open at', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Near me' })).toBeVisible();
    await expect(page.getByLabel('Find a dish')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Cuisine' })).toHaveCount(0);
  });

  test('the intro is one sentence with the count', async ({ page }) => {
    await setup(page);
    await page.goto('/restaurants/open-now');

    const summary = page.locator('[data-open-now-summary]');
    await expect(summary).toHaveText('12 of 12 places whose hours we can read are open right now.');
    await expect(page.locator('[data-open-now-clock]')).toHaveText('8:00 PM CT');
    await expect(page.getByText("Hours come from each restaurant's listing")).toBeHidden();
  });

  test('filters live in a sheet, and an active one is a removable chip with a count', async ({ page }) => {
    await setup(page);
    await page.goto('/restaurants/open-now');

    const filtersButton = page.getByRole('button', { name: /^Filters/ });
    await expect(filtersButton).toHaveText('Filters');
    await filtersButton.click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('group', { name: 'Cuisine' }).getByRole('button', { name: 'Italian' }).click();
    await expect(page).toHaveURL(/cuisine=Italian/);
    await sheet.getByRole('button', { name: /^Show \d+ places?$/ }).click();
    await expect(sheet).toBeHidden();

    // Fixture rows alternate American and Italian: 6 of 12.
    await expect(page.locator('[data-open-now-summary]')).toContainText('6 of 6 places');
    await expect(filtersButton).toHaveText('Filters1 active');
    const chip = page.getByRole('button', { name: 'Remove Cuisine: Italian' });
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(page).not.toHaveURL(/cuisine=/);
    await expect(chip).toHaveCount(0);
    await expect(filtersButton).toHaveText('Filters');
    await expect(page.locator('[data-open-now-summary]')).toContainText('12 of 12 places');
  });
});

test.describe('/restaurants/open-now on a desktop (WEB-UX-084)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the expanded form and no Filters button', async ({ page }) => {
    await setup(page);
    await page.goto('/restaurants/open-now');

    await expect(page.locator('[data-open-now-card]').first()).toBeVisible();
    await expect(page.getByLabel('Find a dish')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Cuisine' })).toBeVisible();
    await expect(page.getByLabel('Diet mentioned')).toBeVisible();
    await expect(page.locator('[data-open-now-filters-button]')).toHaveCount(0);
  });
});
