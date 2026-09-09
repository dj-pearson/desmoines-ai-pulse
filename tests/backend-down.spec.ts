import { test, expect, type Page } from '@playwright/test';

/**
 * WEB-QA-032. With the backend unreachable, no reader-facing route may state
 * absence as a fact.
 *
 * This belongs in the smoke lane because it asserts REAL BROWSER BEHAVIOUR
 * under a condition no source-text check can create. scripts/check-false-empty-state.mjs
 * covers the useEffect shape statically; the TanStack pages fall through to an
 * empty state only after their retries are exhausted, which is a runtime
 * property.
 *
 * Found by serving a production build whose Supabase URL was a placeholder and
 * reading what each page said. The home page answered "No results found - No
 * items available in this category right now."
 */

/** Fail every Supabase call, the way an outage does. */
async function cutTheBackend(page: Page) {
  await page.route('**://*.supabase.co/**', (route) => route.abort('failed'));
  await page.route('**/rest/v1/**', (route) => route.abort('failed'));
  await page.route('**/functions/v1/**', (route) => route.abort('failed'));
}

/**
 * Phrases that assert there is nothing, as opposed to admitting the page could
 * not find out. Kept narrow on purpose: "no results for your search" after a
 * successful query is legitimate copy, so these all describe the unfiltered
 * default view.
 */
const STATES_ABSENCE = [
  'No items available in this category',
  'No shows scheduled for tonight',
  'No games scheduled for today',
  'No games scheduled this week',
  'No weekend shows listed yet',
  'No upcoming concerts found',
  'No upcoming events listed for this venue',
  'No Events Scheduled for Today',
];

/** Any of these means the page owned up to the failure. */
const ADMITS_FAILURE =
  /went wrong|couldn'?t load|could not load|you'?re offline|try again|retry|temporarily unavailable/i;

const ROUTES = ['/', '/music', '/sports', '/events', '/restaurants', '/attractions', '/playgrounds'];

for (const route of ROUTES) {
  test(`${route} admits a backend failure instead of claiming emptiness`, async ({ page }) => {
    await cutTheBackend(page);
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // TanStack retries have to run out before the page settles on a state.
    await expect
      .poll(async () => (await page.locator('#root').innerText()).length, { timeout: 45_000 })
      .toBeGreaterThan(50);
    await page.waitForTimeout(15_000);

    const text = await page.locator('#root').innerText();

    for (const claim of STATES_ABSENCE) {
      expect(text, `${route} told the visitor "${claim}" when the backend was unreachable`)
        .not.toContain(claim);
    }
    expect(text, `${route} showed neither content nor a failure state`).toMatch(ADMITS_FAILURE);
  });
}
