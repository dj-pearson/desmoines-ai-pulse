import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home's one search box (docs/page-plans/home-pass2.md WP1 items 2, 5-8, 12).
 *
 * What this pins:
 *  1. There is exactly one free-text input on `/`.
 *  2. Everything in the box navigates. Enter and an example chip go to
 *     /search?q=; nothing on `/` calls the nlp-search model. The chips used to
 *     run an inline model search, and /search ran it again.
 *  3. Typing a name offers the event, restaurant or place itself, linked with
 *     the detail pages' own slugs, above a "Search everything" row.
 *  4. Escape closes the suggestions from inside the panel and they stay
 *     closed when focus returns to the input.
 *  5. While the AI planner is paused the hero says nothing about AI.
 *
 * The suggestion queries are answered here, after installFixtureBackend, and
 * only for requests that carry an ilike filter; everything else falls through
 * to the fixture backend.
 */

const JAZZ_EVENT = {
  id: '30000000-0000-0000-0000-000000000001',
  title: 'Jazz on the Riverfront',
  venue: 'Principal Riverwalk',
  date: '2026-10-01T00:30:00Z',
  event_start_utc: '2026-10-01T00:30:00Z',
  event_start_local: null,
};
const JAZZ_RESTAURANT = { id: '30000000-0000-0000-0000-000000000002', name: 'Jazz Kitchen', cuisine: 'Cajun', slug: 'jazz-kitchen' };
const JAZZ_ATTRACTION = { id: '30000000-0000-0000-0000-000000000003', name: 'Jazz Sculpture Walk', type: 'park' };

const CORS = { 'access-control-allow-origin': '*' };

function answerIlike(rows: unknown[]) {
  return (route: Route) => {
    if (!/ilike\./.test(decodeURIComponent(route.request().url()))) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'content-range': `0-${rows.length - 1}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  };
}

/** Counts nlp-search calls made while the page is still on `/`. */
function watchNlpSearch(page: Page) {
  const calls: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'OPTIONS') return;
    if (!req.url().includes('/functions/v1/nlp-search')) return;
    if (new URL(page.url()).pathname === '/') calls.push(req.url());
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/events?**', answerIlike([JAZZ_EVENT]));
  await page.route('**/rest/v1/restaurants?**', answerIlike([JAZZ_RESTAURANT]));
  await page.route('**/rest/v1/attractions?**', answerIlike([JAZZ_ATTRACTION]));
});

async function heroInput(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const input = page.getByRole('search').getByRole('searchbox');
  await expect(input).toBeVisible({ timeout: 30_000 });
  return input;
}

test('home has exactly one free-text search input', async ({ page }) => {
  await heroInput(page);
  const freeText = page.locator('input[type="search"]:visible, input[type="text"]:visible, input:not([type]):visible');
  await expect(freeText).toHaveCount(1);
});

test('Enter in the hero search lands on /search?q=', async ({ page }) => {
  const input = await heroInput(page);
  await input.fill('Jazz Kitchen');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=Jazz(%20|\+)Kitchen$/);
});

test('an example chip navigates to /search and / never calls the model', async ({ page }) => {
  const nlpCalls = watchNlpSearch(page);
  const input = await heroInput(page);

  await input.focus();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const chip = page.locator('a[data-search-chip]').first();
  await expect(chip).toBeVisible();
  const example = (await chip.textContent())?.trim() ?? '';
  expect(example.length).toBeGreaterThan(0);
  await expect(chip).toHaveAttribute('href', `/search?q=${encodeURIComponent(example)}`);

  await chip.click();
  await expect(page).toHaveURL(/\/search\?q=/);
  expect(nlpCalls, 'the home page called nlp-search without a navigation').toEqual([]);
});

test('typing a name offers the places themselves, with detail-page links', async ({ page }) => {
  const nlpCalls = watchNlpSearch(page);
  const input = await heroInput(page);

  await input.fill('Jazz');

  const eventLink = page.locator('a[data-result-type="events"]').first();
  await expect(eventLink).toBeVisible();
  // 00:30 UTC on Oct 1 is 19:30 CDT on Sep 30: the slug carries the Central date.
  await expect(eventLink).toHaveAttribute('href', '/events/jazz-on-the-riverfront-2026-09-30');
  await expect(page.locator('a[data-result-type="restaurants"]').first()).toHaveAttribute(
    'href',
    '/restaurants/jazz-kitchen',
  );
  await expect(page.locator('a[data-result-type="attractions"]').first()).toHaveAttribute(
    'href',
    '/attractions/jazz-sculpture-walk',
  );
  await expect(page.locator('a[data-search-everything]')).toHaveAttribute('href', '/search?q=Jazz');

  await eventLink.click();
  await expect(page).toHaveURL(/\/events\/jazz-on-the-riverfront-2026-09-30$/);
  expect(nlpCalls).toEqual([]);
});

test('Escape inside the panel closes it and it stays closed', async ({ page }) => {
  const input = await heroInput(page);

  await input.focus();
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  // Tab past the Search button to the first chip in the panel.
  const chip = page.locator('a[data-search-chip]').first();
  for (let i = 0; i < 4 && !(await chip.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(chip).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('a[data-search-chip]').first()).toBeHidden();
});

test('a search is offered again as a recent search', async ({ page }) => {
  const input = await heroInput(page);
  await input.fill('pizza by the slice');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/);

  const again = await heroInput(page);
  await again.focus();
  await expect(page.getByText('Recent searches')).toBeVisible();
  await expect(page.locator('a[data-search-chip]').first()).toHaveText('pizza by the slice');
});

test('the hero says nothing about AI while the planner is paused', async ({ page }) => {
  await heroInput(page);
  const hero = page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) }).first();
  await expect(hero.getByRole('link', { name: 'Visiting? Plan your dates' })).toHaveAttribute('href', '/trip-planner');
  await expect(hero).not.toContainText(/\bAI\b/);
  await expect(hero).not.toContainText('Insider');
});
