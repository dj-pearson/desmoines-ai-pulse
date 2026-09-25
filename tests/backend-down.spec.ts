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
  // WEB-QA-031, the second batch of pages.
  // Eat & Drink pass 2 WP6 item 3: the page's real empty copy. The old
  // "No breweries found" string no longer exists in src/, so it asserted nothing.
  'No breweries listed yet',
  'No Weekend Events Found',
  'No events are scheduled for this weekend',
  'No Events Found for',
  'No events are currently scheduled for this month',
  'No updates yet',
  'No trails match the selected filters',
];

/** Any of these means the page owned up to the failure. */
const ADMITS_FAILURE =
  /went wrong|couldn'?t load|could not load|you'?re offline|try again|retry|temporarily unavailable/i;

const ROUTES = [
  '/',
  '/music',
  '/sports',
  '/events',
  '/restaurants',
  '/attractions',
  '/playgrounds',
  // WEB-QA-031. Reader-facing and reachable without an account, so the same
  // runtime assertion applies. The signed-in pages this story also fixed
  // (dashboard, profile, trips, billing) are out of scope here rather than
  // untested - they need a session, which this lane does not have.
  '/breweries',
  '/events/this-weekend',
  '/whats-new',
  '/outdoors',
];

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

/*
 * Events pass 2 WP6 item 8. A landing whose first query failed has not
 * answered "what's on", so it must not be indexed as if it had: /events/today
 * (WP3 item 12) and the suburb pages (WP5 item 7) render NoIndexMeta when the
 * events read errors with nothing loaded. The prerender runs against the live
 * backend, so a blip during a build is exactly this state captured to HTML.
 */
//
// /breweries joined with Eat & Drink pass 2 (docs/page-plans/eat-drink-pass2.md
// WP6 item 3): BreweryTrail renders NoIndexMeta when its read errors with no
// rows loaded (src/pages/BreweryTrail.tsx).
const NOINDEX_ON_FAILURE = ['/events/today', '/events/ankeny', '/breweries'];

for (const route of NOINDEX_ON_FAILURE) {
  test(`${route} is noindex when its first query fails`, async ({ page }) => {
    await cutTheBackend(page);
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // The error lands after TanStack's retries, so poll rather than sleep.
    await expect
      .poll(
        async () =>
          page
            .locator('head meta[name="robots"]')
            .evaluateAll((els) => els.map((el) => el.getAttribute('content') ?? '')),
        { timeout: 45_000, message: `${route} never marked itself noindex after the backend failed` },
      )
      .toContainEqual(expect.stringContaining('noindex'));
  });
}
