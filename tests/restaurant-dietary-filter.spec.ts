/**
 * The dietary filter on /restaurants (WEB-FEAT-032).
 *
 * It did nothing. The filter UI writes its selections into `filters.tags`,
 * because the URL parameter is `tags`, while useRestaurants only read
 * `filters.dietary`, which no caller populates. That also left the query on the
 * rotation RPC, which by its own comment cannot express dietary filtering. So
 * the URL changed, the active-filter count went up, and the same unfiltered
 * list came back.
 *
 * This asserts against the OUTGOING REQUEST rather than the rendered list,
 * because with stubbed data any list would look plausible - the question is
 * whether the constraint reached PostgREST at all.
 */
import { test, expect } from '@playwright/test';

async function captureRestaurantRequests(page) {
  const urls: string[] = [];
  await page.route('**/rest/v1/**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/functions/v1/**', (r) =>
    r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
  return urls;
}

test('a dietary selection reaches the query', async ({ page }) => {
  const urls = await captureRestaurantRequests(page);
  await page.goto('/restaurants?tags=vegan');
  await page.waitForTimeout(2500);

  const decoded = urls.map((u) => decodeURIComponent(u));
  const filtered = decoded.filter((u) => /ilike.*vegan/i.test(u));
  expect(
    filtered.length,
    `no request carried the vegan keyword fan-out. Requests seen:\n${decoded.join('\n')}`,
  ).toBeGreaterThan(0);
});

test('a dietary selection knocks the query off the rotation RPC', async ({ page }) => {
  const urls = await captureRestaurantRequests(page);
  await page.goto('/restaurants?tags=vegan');
  await page.waitForTimeout(2500);

  // get_rotated_restaurants cannot express the ILIKE fan-out, so a dietary
  // filter must take the table path instead.
  const rpcCalls = urls.filter((u) => u.includes('get_rotated_restaurants'));
  expect(rpcCalls).toHaveLength(0);
});

test('no dietary selection still uses the rotation RPC', async ({ page }) => {
  const urls = await captureRestaurantRequests(page);
  await page.goto('/restaurants');
  await page.waitForTimeout(2500);

  expect(urls.some((u) => u.includes('get_rotated_restaurants'))).toBe(true);
});
