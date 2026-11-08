import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Eat & Drink pass 2 WP4.12-4.13: /restaurants/dietary.
 *
 * Each diet has its own self-canonical path, the old `?diet=` URL ends on that
 * path, and "Show N more" reveals the rows already fetched instead of sending
 * the visitor to the unfiltered hub.
 */

const ISO = '2026-09-01T00:00:00Z';

function restaurant(i: number) {
  return {
    id: `62000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Vegan Place ${String(i).padStart(2, '0')}`,
    city: 'Des Moines',
    created_at: ISO,
    cuisine: 'Vegan',
    data_quality_score: 80,
    // Long enough to fill the card's two-line clamp at every width, like most
    // real rows. The .content-auto placeholder is sized to that card
    // (WEB-PERF-071); a one-line description is 1.42rem shorter.
    description:
      'A neighborhood spot with grain bowls, tofu banh mi and a rotating soup, plus vegan pastries on weekends and a short local beer list.',
    enhanced: false,
    google_place_id: null,
    image_url: null,
    is_featured: false,
    is_merged: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58,
    location: 'Des Moines',
    longitude: -93.62,
    merged_at: null,
    merged_into: null,
    opening: null,
    opening_date: null,
    opening_timeframe: null,
    phone: null,
    popularity_score: 50,
    price_range: '$$',
    rating: 4.3,
    slug: `vegan-place-${i}`,
    source_url: null,
    status: 'open',
    updated_at: ISO,
    website: null,
    writeup_generated_at: null,
  };
}

function json(route: Route, rows: unknown[]) {
  const headers = {
    'access-control-allow-origin': '*',
    'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
  };
  if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
}

/**
 * How far a control moves over the 10 frames after it is scrolled into view.
 *
 * The cards are `content-visibility: auto`, so rows near the viewport render a
 * few frames after a scroll. When the placeholder was a flat 420px and a card
 * rendered at 495px, the control under the grid moved 74px about three frames
 * later (top 333 -> 407, page 9277 -> 9501px, every run). Playwright's
 * "stable" check compares two consecutive frames and can pass before that.
 *
 * With `scroll`, the scroll happens in the page and the start position is read
 * in the same task, before any frame renders the newly visible rows. Scrolling
 * with Playwright first lets the shift land before the measurement starts: at
 * 1280px the old placeholder passed that way.
 */
function movementOver10Frames(control: Locator, scroll = false) {
  return control.evaluate(
    (el, scrollFirst) =>
      new Promise<number>((resolve) => {
        if (scrollFirst) el.scrollIntoView({ block: 'center' });
        const start = el.getBoundingClientRect().top;
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (frames < 10) requestAnimationFrame(tick);
          else resolve(Math.abs(el.getBoundingClientRect().top - start));
        };
        requestAnimationFrame(tick);
      }),
    scroll,
  );
}

/**
 * Click a control below the card grid once it has stopped moving. Under load a
 * late shift landing between mousedown and mouseup means the mouseup hits the
 * section and no click fires (WEB-QA-058: 2 of 60 at four workers, the button
 * left focused and the list at 36). The page should no longer shift
 * (WEB-PERF-071, asserted below); this keeps the click honest if it ever does.
 */
async function clickWhenSettled(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect
    .poll(() => movementOver10Frames(control), {
      message: 'the control should hold still for 10 frames after it is scrolled into view',
    })
    .toBe(0);
  await control.click();
}

async function setup(page: Page, count: number) {
  await installFixtureBackend(page);
  const rows = Array.from({ length: count }, (_, i) => restaurant(i));
  await page.route('**/rest/v1/restaurants?**', (route) => json(route, rows));
}

test.describe('/restaurants/dietary', () => {
  test('a diet has its own page, with a self-canonical', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary/vegan');

    await expect(page.getByRole('heading', { level: 1, name: 'Vegan Restaurants in Des Moines' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/restaurants\/dietary\/vegan$/);
    await expect(page.getByRole('button', { name: 'Vegan', pressed: true })).toBeVisible();

    await page.getByRole('button', { name: 'Halal' }).click();
    await expect(page).toHaveURL(/\/restaurants\/dietary\/halal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Halal Restaurants in Des Moines' })).toBeVisible();
  });

  test('the old ?diet= URL ends on the path', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary?diet=vegan');
    await expect(page).toHaveURL(/\/restaurants\/dietary\/vegan$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Vegan Restaurants in Des Moines' })).toBeVisible();
  });

  test('an unknown diet goes to the index', async ({ page }) => {
    await setup(page, 3);
    await page.goto('/restaurants/dietary/paleo');
    await expect(page).toHaveURL(/\/restaurants\/dietary$/);
    await expect(page.getByRole('link', { name: 'Vegan', exact: true })).toHaveAttribute('href', '/restaurants/dietary/vegan');
  });

  test('"Show more" reveals the fetched rows, and "first 100" only at the limit', async ({ page }) => {
    await setup(page, 50);
    await page.goto('/restaurants/dietary/vegan');

    await expect(page.getByRole('heading', { level: 2, name: 'Mentions vegan (50)' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^Vegan Place / })).toHaveCount(36);
    await clickWhenSettled(page.getByRole('button', { name: 'Show 14 more' }));
    await expect(page.getByRole('heading', { level: 3, name: /^Vegan Place / })).toHaveCount(50);
    await expect(page.locator('[data-dietary-more]')).toContainText('Showing 50 of 50');
  });

  // WEB-PERF-071. One measurement, not a poll: the first scroll is the one a
  // visitor makes. 390, 768 and 1280 cover the three root font-sizes the
  // placeholder's rem has to track. On the old 420px placeholder it moved
  // 1, 51 and 103px at those widths.
  for (const width of [390, 768, 1280]) {
    test(`the control under the grid holds still once scrolled to (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setup(page, 50);
      await page.goto('/restaurants/dietary/vegan');
      await expect(page.getByRole('heading', { level: 3, name: /^Vegan Place / })).toHaveCount(36);
      await page.evaluate(() => document.fonts.ready);

      const more = page.getByRole('button', { name: 'Show 14 more' });
      expect(await movementOver10Frames(more, true), 'pixels the control moved over 10 frames').toBeLessThan(1);
    });
  }

  test('a full fetch says "first 100"', async ({ page }) => {
    await setup(page, 100);
    await page.goto('/restaurants/dietary/vegan');
    await expect(page.getByRole('heading', { level: 2, name: 'Mentions vegan (first 100)' })).toBeVisible();
  });
});
