import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay WP6: /whats-new (docs/page-plans/plan-stay.md).
 *
 * 1. With only new_opening rows, only "All updates" and "New openings" chips
 *    render. The other four types have no writer anywhere in the repo.
 * 2. /whats-new?type=new_opening preselects its chip and filters the query.
 * 3. A filtered empty view says "<label>: none yet" with "Show all updates";
 *    "No updates yet" is only for the unfiltered view.
 * 4. A row dated tomorrow is not shown, and the query asks for
 *    publish_date <= now.
 * 5. A restaurant update links by slug; source_url renders as "Source" only
 *    when it is an http(s) URL.
 * 6. axe color-contrast passes on the feed in light and dark.
 *
 * The scene_updates route is registered AFTER installFixtureBackend, which
 * the fixture documents as the way to win the match. It does not filter by
 * type or date, on purpose: the client-side future-row guard has to hold even
 * when the server returns something it should not have.
 */

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function row(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `51000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Fixture Opening ${i}`,
    body: 'A restaurant opening supplied by whats-new.spec.ts.',
    update_type: 'new_opening',
    entity_type: null,
    entity_id: null,
    image_url: null,
    source_url: null,
    neighborhood: null,
    publish_date: new Date(now - (i + 1) * DAY).toISOString(),
    ...extra,
  };
}

const RESTAURANT_ID = '52000000-0000-0000-0000-000000000001';

const ROWS = [
  row(0, {
    title: 'Fixture Bistro opens downtown',
    entity_type: 'restaurant',
    entity_id: RESTAURANT_ID,
    source_url: 'https://news.example.com/fixture-bistro',
  }),
  row(1, { title: 'Hostile source row', source_url: 'javascript:alert(1)' }),
  row(2),
  row(3, { publish_date: new Date(now - 30 * DAY).toISOString() }),
  row(9, { title: 'Scheduled for tomorrow', publish_date: new Date(now + DAY).toISOString() }),
];

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function installSceneUpdates(page: Page, table = ROWS, seen: URL[] = []) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/scene_updates**', (route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const type = (url.searchParams.get('update_type') || '').replace(/^eq\./, '');
    // Type is the one filter honoured, so the filtered-empty case can be
    // reached; dates are deliberately not.
    const rows = type ? table.filter((r) => r.update_type === type) : table;
    // The chip counts are count-only HEAD requests (pass 2 WP4 item 8): a
    // count in content-range and no body.
    if (route.request().method() === 'HEAD') {
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': `*/${rows.length}`,
        },
        body: '',
      });
    }
    return json(route, rows);
  });
  await page.route('**/rest/v1/restaurants**', (route) => {
    const url = new URL(route.request().url());
    if ((url.searchParams.get('select') || '').replace(/\s/g, '') === 'id,slug,status,is_merged') {
      return json(route, [{ id: RESTAURANT_ID, slug: 'fixture-bistro', status: 'open', is_merged: false }]);
    }
    return route.fallback();
  });
}

test.describe("What's new", () => {
  test('renders a chip only for types that have rows', async ({ page }) => {
    const seen: URL[] = [];
    await installSceneUpdates(page, ROWS, seen);
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });

    const group = page.getByRole('group', { name: 'Filter updates by type' });
    await expect(page.getByRole('heading', { name: 'Fixture Bistro opens downtown' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(group.getByRole('button')).toHaveText(['All updates', 'New openings']);
    await expect(group.getByRole('button', { name: 'All updates' })).toHaveAttribute('aria-pressed', 'true');

    // Scheduled rows stay out, on the server and again on the client.
    await expect(page.getByText('Scheduled for tomorrow')).toHaveCount(0);
    expect(seen.some((u) => (u.searchParams.get('publish_date') || '').startsWith('lte.'))).toBe(true);
    // No select=* on the feed query.
    expect(seen.every((u) => u.searchParams.get('select') !== '*')).toBe(true);
  });

  test('?type= preselects its chip and filters the query', async ({ page }) => {
    const seen: URL[] = [];
    await installSceneUpdates(page, ROWS, seen);
    await page.goto('/whats-new?type=new_opening', { waitUntil: 'domcontentloaded' });

    const chip = page
      .getByRole('group', { name: 'Filter updates by type' })
      .getByRole('button', { name: 'New openings' });
    await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Fixture Bistro opens downtown' })).toBeVisible();
    expect(seen.some((u) => u.searchParams.get('update_type') === 'eq.new_opening')).toBe(true);
  });

  test('a filtered empty view is not "No updates yet"', async ({ page }) => {
    await installSceneUpdates(page);
    await page.goto('/whats-new?type=closing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Closings: none yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No updates yet')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show all updates' }).click();
    await expect(page).toHaveURL(/\/whats-new$/);
    await expect(page.getByRole('heading', { name: 'Fixture Bistro opens downtown' })).toBeVisible();
  });

  test('links restaurants by slug and only renders http(s) sources', async ({ page }) => {
    await installSceneUpdates(page);
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });

    const title = page.getByRole('link', { name: 'Fixture Bistro opens downtown', exact: true });
    await expect(title).toHaveAttribute('href', '/restaurants/fixture-bistro', { timeout: 15_000 });

    const sources = page.getByRole('link', { name: /^Source for/ });
    await expect(sources).toHaveCount(1);
    await expect(sources).toHaveAttribute('href', 'https://news.example.com/fixture-bistro');

    // Older than a week: an absolute date inside <time dateTime>.
    const old = page.locator('time[datetime]').filter({ hasNotText: /ago|Just now/ });
    await expect(old.first()).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`color contrast passes in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await installSceneUpdates(page);
      await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Fixture Bistro opens downtown' })).toBeVisible({
        timeout: 15_000,
      });

      const results = await new AxeBuilder({ page })
        .include('[data-whats-new]')
        .withRules(['color-contrast'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
        [],
      );
    });
  }
});
