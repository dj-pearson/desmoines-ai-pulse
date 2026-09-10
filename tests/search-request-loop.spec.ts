import { test, expect } from '@playwright/test';

/**
 * WEB-QA-033. /search must call the nlp-search edge function once per query,
 * not once per render.
 *
 * useNLPSearch built its `search` callback with `[searchMutation]` as the
 * dependency. useMutation returns a NEW object every render, so `search` got a
 * new identity every render - and SearchResults calls it from an effect keyed
 * on it. That is a loop: search -> state change -> re-render -> new identity ->
 * effect re-runs -> search. Measured on /search?q=pizza before the fix: 82
 * calls in 16 seconds, each an AI request, against a function rate-limited to
 * 100 per 15 minutes.
 *
 * A rendering assertion would not have caught it. The page looked merely empty,
 * because the mutation restarted before it could ever settle into an error
 * state - it sat in the loading skeleton forever. Only the request COUNT shows
 * the defect, which is why this counts requests.
 */

test('a single search fires one nlp-search request, not one per render', async ({ page }) => {
  let calls = 0;
  // Order matters and the patterns must not overlap. A broad
  // `**://*.supabase.co/**` registered alongside this one can swallow the
  // nlp-search request, leaving the counter at zero and the assertion below
  // passing on a page that never searched at all - a test that cannot fail.
  // So the counting route is registered LAST (Playwright gives the most
  // recently added route priority) and the assertion insists it fired.
  await page.route('**://*.supabase.co/rest/**', (route) => route.abort('failed'));
  await page.route('**/functions/v1/nlp-search**', (route) => {
    calls += 1;
    // Fail it deliberately: a failing search is the case that used to spin
    // fastest, and it keeps the test independent of backend data.
    return route.abort('failed');
  });

  await page.goto('/search?q=pizza', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  await page.waitForTimeout(15_000);

  // One request, plus whatever retry policy allows. Anything in the dozens is
  // the render loop back.
  expect(calls, 'nlp-search was never called - this test proved nothing').toBeGreaterThan(0);
  expect(calls, `nlp-search was called ${calls} times for one query`).toBeLessThanOrEqual(4);
});

test('a query under three characters says so instead of rendering nothing', async ({ page }) => {
  await page.route('**://*.supabase.co/**', (route) => route.abort('failed'));

  await page.goto('/search?q=x', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

  // useNLPSearch returns early under three characters, so no branch of the
  // results area used to match and the page rendered a search box and nothing.
  await expect(page.getByText(/at least three characters/i)).toBeVisible({ timeout: 15_000 });
});
