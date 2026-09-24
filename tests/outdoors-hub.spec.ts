import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP6: /outdoors.
 *
 * 1. No literal "69": the playground count is computed from rows within 30 mi
 *    of downtown, and is absent when that query fails.
 * 2. /outdoors?difficulty=moderate loads pre-filtered, with aria-pressed on the
 *    active toggle, and Back restores the prior filter.
 * 3. Trail cards have a directions link and no <a> nested in an <a>.
 * 4. Every destination shows a "Details checked" date.
 *
 * Table overrides are registered AFTER installFixtureBackend, which the fixture
 * documents as the way to win the match.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const headers = { 'access-control-allow-origin': '*' };

function trail(i: number, difficulty: string, activities: string[]) {
  return {
    id: `61000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Fixture Trail ${i}`,
    slug: `fixture-trail-${i}`,
    description: 'A trail supplied by outdoors-hub.spec.ts.',
    length_miles: 3 + i,
    difficulty,
    surface_type: 'paved',
    activities,
    highlights: null,
    trailhead_address: null,
    latitude: 41.6 + i * 0.01,
    longitude: -93.7,
    image_url: null,
    website: null,
    is_featured: false,
    created_at: ISO,
  };
}

const TRAILS = [
  trail(1, 'easy', ['walking', 'biking']),
  trail(2, 'moderate', ['hiking']),
  trail(3, 'moderate', ['biking']),
  trail(4, 'difficult', ['hiking', 'running']),
];

// Three in the metro, two far out of state. The page should say 3.
const PLAYGROUNDS = [
  { name: 'Metro Playground A', latitude: 41.59, longitude: -93.62 },
  { name: 'Metro Playground B', latitude: 41.7, longitude: -93.6 },
  { name: 'Metro Playground C', latitude: 41.53, longitude: -93.8 },
  { name: 'Portland Playground', latitude: 45.52, longitude: -122.68 },
  { name: 'Denver Playground', latitude: 39.74, longitude: -104.99 },
];

function fulfilRows(route: Route, rows: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

async function installOutdoorsFixtures(page: Page, { playgroundsFail = false } = {}) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/trails**', (route) => fulfilRows(route, TRAILS));
  await page.route('**/rest/v1/playgrounds**', (route) =>
    playgroundsFail
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ message: 'fixture failure' }),
        })
      : fulfilRows(route, PLAYGROUNDS),
  );
}

const trailCards = (page: Page) => page.locator('section[aria-labelledby="trails-heading"] h3');

test('states the metro playground count, never 69', async ({ page }) => {
  await installOutdoorsFixtures(page);
  await page.goto('/outdoors');

  const kids = page.locator('section[aria-labelledby="playgrounds-heading"]');
  const related = page.locator('section[aria-labelledby="related-heading"]');
  await expect(kids.getByText(/3 play spaces within about 30 miles/)).toBeVisible();
  await expect(related.getByText(/3 play spaces in the metro/)).toBeVisible();
  await expect(kids).not.toContainText('69');
  await expect(related).not.toContainText('69');
  await expect(kids).not.toContainText('best-ranking');
});

test('states no playground count when the query fails', async ({ page }) => {
  await installOutdoorsFixtures(page, { playgroundsFail: true });
  await page.goto('/outdoors');

  await expect(trailCards(page)).toHaveCount(4);
  // Let the playground query exhaust its retries.
  await page.waitForTimeout(10_000);
  await expect(page.getByText(/play spaces within about 30 miles/)).toHaveCount(0);
  await expect(page.getByText(/The full metro list has age ranges/)).toBeVisible();
});

test('?difficulty=moderate loads pre-filtered and Back restores the prior filter', async ({ page }) => {
  await installOutdoorsFixtures(page);
  await page.goto('/outdoors?difficulty=moderate');

  await expect(trailCards(page)).toHaveCount(2);
  await expect(page.getByText('2 trails', { exact: true })).toBeVisible();

  const difficulty = page.getByRole('group', { name: 'Difficulty' });
  await expect(difficulty.getByRole('button', { name: 'Moderate' })).toHaveAttribute('aria-pressed', 'true');
  await expect(difficulty.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

  await difficulty.getByRole('button', { name: 'Difficult' }).click();
  await expect(page).toHaveURL(/difficulty=difficult/);
  await expect(trailCards(page)).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(/difficulty=moderate/);
  await expect(trailCards(page)).toHaveCount(2);
});

test('an empty filter result offers Clear filters', async ({ page }) => {
  await installOutdoorsFixtures(page);
  await page.goto('/outdoors?difficulty=easy&activity=hiking');

  await expect(page.getByText('No trails match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(trailCards(page)).toHaveCount(4);
  await expect(page).not.toHaveURL(/difficulty=/);
});

test('trail cards carry directions without nesting links', async ({ page }) => {
  await installOutdoorsFixtures(page);
  await page.goto('/outdoors');

  await expect(trailCards(page)).toHaveCount(4);
  await expect(page.locator('a a')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Directions to Fixture Trail 1 trailhead' })).toHaveAttribute(
    'href',
    /google\.com\/maps\/dir\/\?api=1&destination=41\.61,-93\.7/,
  );
});

test('every destination shows a checked date', async ({ page }) => {
  await installOutdoorsFixtures(page);
  await page.goto('/outdoors');

  const checked = page.locator('section[aria-labelledby="destinations-heading"] article time[datetime]');
  await expect(checked).toHaveCount(8);
});
