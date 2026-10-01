import { test, expect } from '@playwright/test';

/**
 * WEB-PERF-043. No route may hammer one backend endpoint.
 *
 * This generalises the guard written for WEB-QA-033, where useNLPSearch built
 * its callback with the whole useMutation object as a dependency and /search
 * called the AI search function 82 times in 16 seconds for one query. That is
 * a CLASS of bug - an effect keyed on a callback whose identity changes every
 * render - and it is invisible to any assertion about the DOM. The page looked
 * merely empty while it spun.
 *
 * So this counts requests per endpoint across the main routes instead of
 * checking what rendered.
 *
 * THE BACKEND IS CUT DELIBERATELY. It makes the run independent of data, and
 * it is also the worst case: a failing query is what spins fastest, and it is
 * the state a render loop reaches soonest.
 *
 * Choosing the budget. With the backend unreachable TanStack retries each
 * query twice, so one query is three requests. Measured across seventeen
 * routes after the WEB-QA-033 fix, the busiest single endpoint was
 * rpc/get_active_ads at 6 on / and /restaurants - two and three distinct ad
 * PLACEMENTS respectively, each a legitimately separate query key, times the
 * retries. Nothing else exceeded 11 for a whole table across every query that
 * touches it. 20 leaves room for a page that grows a section or two and still
 * catches a loop by an order of magnitude.
 */

const ROUTES = [
  '/',
  '/events',
  '/restaurants',
  '/attractions',
  '/playgrounds',
  '/music',
  '/sports',
  '/search?q=live%20music',
  '/things-to-do',
];

/** One query is three requests when every attempt fails. */
const MAX_PER_ENDPOINT = 20;

/**
 * Per-route ceilings where a page has a known reason to sit below the shared
 * one. /things-to-do (explore pass 2 WP6 item 10): the Open-now block reads
 * attractions through useAttractions, with the same filters and cache key as
 * /attractions, and counts live deals through useDeals. Each is one query,
 * so three requests per endpoint with every attempt failing. Measured on a
 * production build with the backend cut, 2026-09-25: events 6 (the Tonight
 * rail and the weekend line), attractions 3, deals 3, pseo_pages 3,
 * seasonal_guides 3. 12 is two more queries on the busiest table; a loop is
 * an order of magnitude past it.
 */
const ROUTE_MAX_PER_ENDPOINT: Record<string, number> = {
  '/things-to-do': 12,
};

for (const route of ROUTES) {
  test(`${route} does not hammer any one endpoint`, async ({ page }) => {
    const counts = new Map<string, number>();

    await page.route('**://*.supabase.co/**', (r) => {
      const url = r.request().url();
      // Group by table or function name; the query string varies per caller and
      // is not what this is measuring.
      const key = url.match(/\/(?:rest|functions)\/v1\/([^?/]+)/)?.[1] ?? 'other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return r.abort('failed');
    });

    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForTimeout(16_000); // let retries run out

    const limit = ROUTE_MAX_PER_ENDPOINT[route] ?? MAX_PER_ENDPOINT;
    const over = [...counts.entries()].filter(([, n]) => n > limit);
    expect(
      over,
      `endpoints called more than ${limit} times on ${route}: ` +
        over.map(([k, n]) => `${k} x${n}`).join(', ')
    ).toEqual([]);
  });
}
