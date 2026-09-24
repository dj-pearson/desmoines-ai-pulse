import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WP1 (docs/page-plans/home.md): an anonymous load of `/` with no scroll makes
 * 6 or fewer Supabase requests, and get_trending_events is called at most once.
 *
 * Every lazy section on Home used to mount at once, so roughly a dozen
 * requests fired before first interaction - for a dashboard, MostSearched and
 * a snapshot nobody had scrolled to, plus a second and third copy of the
 * trending list. LazySection now defers the mount (and so the queries) of
 * everything below the rails until it is near the viewport.
 *
 * Unlike request-budget.spec.ts this runs against the fixture backend, so every
 * query SUCCEEDS and nothing retries: one query is one request, and the count
 * is the page's real first-view cost. Preflights are not counted.
 */

const MAX_REQUESTS = 6;

async function countFirstView(page: Page) {
  const counts = new Map<string, number>();
  page.on('request', (req) => {
    if (req.method() === 'OPTIONS') return;
    const m = req.url().match(/\/(rest|functions)\/v1\/(?:rpc\/)?([^?/]+)/);
    if (!m) return;
    const key = m[2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  await installFixtureBackend(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('search')).toBeVisible({ timeout: 30_000 });
  // Long enough for every first-view query to have fired; no scrolling.
  await page.waitForTimeout(6_000);
  return counts;
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1366, height: 768 },
];

for (const vp of VIEWPORTS) {
  test(`anonymous first view of / stays within ${MAX_REQUESTS} Supabase requests (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const counts = await countFirstView(page);

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const detail = [...counts.entries()].map(([k, n]) => `${k} x${n}`).join(', ');

    expect(counts.get('get_trending_events') ?? 0, `get_trending_events called more than once: ${detail}`).toBeLessThanOrEqual(1);
    expect(total, `first view made ${total} Supabase requests: ${detail}`).toBeLessThanOrEqual(MAX_REQUESTS);
  });
}

test('the search input is in the first viewport on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtureBackend(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const input = page.getByRole('search').getByRole('combobox');
  await expect(input).toBeInViewport({ timeout: 30_000 });
});
