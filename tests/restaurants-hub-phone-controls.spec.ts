import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The /restaurants controls on a 390px phone (WEB-UX-086).
 *
 * Before: the filter pills scrolled sideways beside a fixed-width sort select
 * with no scrollbar and no fade, so Rating and Dietary sat off-screen; active
 * chips wrapped inside the sticky bar; the search box left about 110px to
 * type in; and the list/map toggle existed only in the hero.
 *
 * RUNS AGAINST FIXTURES (tests/support/fixtureBackend.ts), which do not
 * filter. These tests read layout, not results.
 */

const TOTAL = 478;
/** The sticky bar's ceiling with three filters on, stated in Restaurants.tsx. */
const STICKY_MAX_PX = 160;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function gotoHub(page: Page, path = '/restaurants') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
  await installFixtureBackend(page, { restaurantTotal: TOTAL });
  await page.goto(path);
  await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);
}

test('all four filter pills are on screen at 390px, and nothing marks a hidden edge', async ({ page }) => {
  await gotoHub(page);
  const bar = page.locator('[data-hub-controls]');
  for (const name of ['Cuisine', 'Price', 'Rating', 'Dietary']) {
    const pill = bar.getByRole('button', { name: new RegExp(`^${name}`) });
    await expect(pill).toBeVisible();
    const box = (await pill.boundingBox())!;
    expect(box.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} ends on screen`).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  // The row fits, so no fade claims there is more to the right.
  await expect(bar.locator('[data-filter-row-fade]')).toHaveCount(0);
});

test('where the pills cannot fit, a fade marks the edge that has more', async ({ page }) => {
  // Counter-assertion for the test above: at 320px the row overflows and the
  // fade must appear, then go once the row is scrolled to its end.
  await page.setViewportSize({ width: 320, height: 700 });
  await gotoHub(page);
  const bar = page.locator('[data-hub-controls]');
  await expect(bar.locator('[data-filter-row-fade]')).toHaveCount(1);
  await bar.locator('[data-filter-row]').evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(bar.locator('[data-filter-row-fade]')).toHaveCount(0);
});

test('with three filters on, chips scroll in one row and the sticky bar stays under 160px', async ({ page }) => {
  await gotoHub(page, '/restaurants?cuisine=Italian&price=%24%24&rmin=4');
  const bar = page.locator('[data-hub-controls]');
  const chips = bar.getByRole('button', { name: /^Remove / });
  await expect(chips).toHaveCount(3);

  const tops = await chips.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'all chips on one row').toBe(1);

  // Active pills stay on screen too (their count badge is dropped below sm).
  for (const name of ['Cuisine', 'Price', 'Rating', 'Dietary']) {
    const box = (await bar.getByRole('button', { name: new RegExp(`^${name}`) }).boundingBox())!;
    expect(box.x + box.width, `${name} ends on screen with filters on`).toBeLessThanOrEqual(390);
  }

  const height = (await bar.boundingBox())!.height;
  expect(height).toBeLessThanOrEqual(STICKY_MAX_PX);

  // Still pinned, at the same height, once the list has scrolled under it.
  await page.mouse.wheel(0, 1500);
  await expect
    .poll(async () => Math.round((await bar.boundingBox())!.y))
    .toBeLessThanOrEqual(80);
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(STICKY_MAX_PX);
});

test('the list/map toggle and the sort are in the sticky bar, not the hero', async ({ page }) => {
  await gotoHub(page);
  const bar = page.locator('[data-hub-controls]');
  await expect(bar.getByRole('button', { name: 'Map view' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByRole('combobox', { name: 'Sort restaurants' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map view' })).toHaveCount(1);

  // Reachable after scrolling, which is the point of moving it.
  await page.mouse.wheel(0, 2000);
  const mapButton = bar.getByRole('button', { name: 'Map view' });
  await expect.poll(async () => (await mapButton.boundingBox())!.y).toBeLessThan(200);
  await mapButton.click();
  await expect(page).toHaveURL(/[?&]view=map/);
});

test('the search box has no Search button below sm and at least 200px to type in', async ({ page }) => {
  await gotoHub(page);
  const input = page.getByRole('combobox', { name: 'Search restaurants' });
  await input.fill('tacos');
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);

  const typeable = await input.evaluate((el) => {
    const cs = getComputedStyle(el);
    // The border box, not clientWidth: Chromium reports an input's
    // clientWidth without its padding, which would count the padding twice.
    const px = (v: string) => parseFloat(v) || 0;
    return (
      el.getBoundingClientRect().width -
      px(cs.paddingLeft) -
      px(cs.paddingRight) -
      px(cs.borderLeftWidth) -
      px(cs.borderRightWidth)
    );
  });
  expect(typeable).toBeGreaterThanOrEqual(200);

  // Enter searches at once, so losing the button loses nothing.
  await input.press('Enter');
  await expect(page).toHaveURL(/[?&]q=tacos/);
});

test('Surprise Me is labelled on the phone hero', async ({ page }) => {
  await gotoHub(page);
  const surprise = page.getByRole('button', { name: 'Surprise Me' });
  await expect(surprise).toBeVisible();
  // An sr-only label passes a name check and toHaveText, so measure: the
  // icon-only button was 44px wide; with the words showing it is about 130.
  expect((await surprise.boundingBox())!.width).toBeGreaterThan(90);
});
