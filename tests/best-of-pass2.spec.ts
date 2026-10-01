import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay pass 2, WP5: the index and the schema agree with the category
 * page, and the booth searches only real places.
 *
 * Voting tables and RPCs are answered here, registered after
 * installFixtureBackend so they win. RPC shapes are the migrations':
 *   voting_category_tallies() -> { category_id, vote_count }[]
 *   voting_results(uuid)      -> { entity_type, entity_id, custom_entry, vote_count }[]
 *   voting_winners()          -> { category_id, category_name, entity_id, vote_count }[]
 * voting_winners skips write-ins (entity_id IS NOT NULL, 20260823000001).
 */

const DAY = 24 * 60 * 60 * 1000;
const JAZZ_KITCHEN = '10000000-0000-0000-0000-000000000000';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  is_active: boolean;
  voting_start: string;
  voting_end: string | null;
  created_at: string;
}

function category(id: string, name: string, slug: string): CategoryRow {
  return {
    id,
    name,
    slug,
    description: 'Fixture category.',
    icon: 'trophy',
    is_active: true,
    voting_start: new Date(Date.now() - 30 * DAY).toISOString(),
    voting_end: new Date(Date.now() + 30 * DAY).toISOString(),
    created_at: '2026-01-01T00:00:00Z',
  };
}

const PIZZA = category('c0000000-0000-4000-8000-000000000001', 'Best Pizza', 'best-pizza');
const COFFEE = category('c0000000-0000-4000-8000-000000000002', 'Best Coffee', 'best-coffee');

type Tally = { entity_type: string; entity_id: string | null; custom_entry: string | null; vote_count: number };

interface Setup {
  results?: Record<string, Tally[]>;
  winners?: Array<{ category_id: string; category_name: string; entity_id: string; vote_count: number }>;
  talliesFail?: boolean;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

async function setup(page: Page, opts: Setup = {}): Promise<{ searches: string[] }> {
  const searches: string[] = [];
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ version: '2026-04-13', timestamp: new Date().toISOString(), essential: true, preferences: true, analytics: true, advertising: true }),
      );
    } catch {
      /* private mode */
    }
  });
  await installFixtureBackend(page);

  // Record the booth's search reads, then let the fixture backend answer them.
  await page.route(/\/rest\/v1\/(restaurants|attractions)\?.*name=ilike/, (route) => {
    searches.push(decodeURIComponent(route.request().url()));
    return route.fallback();
  });

  await page.route('**/rest/v1/voting_categories**', (route) => {
    const url = new URL(route.request().url());
    const slug = url.searchParams.get('slug');
    const rows = slug ? [PIZZA, COFFEE].filter((c) => `eq.${c.slug}` === slug) : [PIZZA, COFFEE];
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (wantsObject) return rows[0] ? json(route, rows[0]) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
    return json(route, rows);
  });
  await page.route('**/rest/v1/votes**', (route) => json(route, []));
  await page.route('**/rest/v1/rpc/voting_category_tallies**', (route) =>
    opts.talliesFail
      ? json(route, { code: 'XX000', message: 'tallies down' }, 500)
      : json(
          route,
          Object.entries(opts.results ?? {}).map(([category_id, rows]) => ({
            category_id,
            vote_count: rows.reduce((n, r) => n + r.vote_count, 0),
          })),
        ),
  );
  await page.route('**/rest/v1/rpc/voting_results**', (route) => {
    let id = '';
    try {
      id = String((route.request().postDataJSON() as { p_category_id?: string }).p_category_id ?? '');
    } catch {
      id = '';
    }
    return json(route, opts.results?.[id] ?? []);
  });
  await page.route('**/rest/v1/rpc/voting_winners**', (route) => json(route, opts.winners ?? []));
  return { searches };
}

test.describe('Best-of pass 2 (Plan & Stay WP5)', () => {
  test('/best-of names the top listed place when a write-in leads', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [
          { entity_type: 'custom', entity_id: null, custom_entry: 'Fixture Write-in', vote_count: 10 },
          { entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 3 },
        ],
      },
      winners: [{ category_id: PIZZA.id, category_name: PIZZA.name, entity_id: JAZZ_KITCHEN, vote_count: 3 }],
    });

    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });
    const list = page.getByRole('list').filter({ hasText: 'Best Pizza' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByText('Top listed place: Jazz Kitchen (3 votes)')).toBeVisible();
    await expect(page.getByText(/Leading/)).toHaveCount(0);
    await expect(page.getByText(/change it/i)).toHaveCount(0);
    // Some category has votes, so the rank column is shown.
    await expect(list.getByText('Rank', { exact: false }).first()).toBeAttached();
  });

  test('/best-of with the tallies RPC down never says "No votes yet"', async ({ page }) => {
    await setup(page, { talliesFail: true });

    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });
    const list = page.getByRole('list').filter({ hasText: 'Best Pizza' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Vote counts couldn't be loaded", { exact: false })).toBeVisible();
    await expect(page.getByText('No votes yet')).toHaveCount(0);
    await expect(page.getByText(/^0 votes$/)).toHaveCount(0);
    await expect(list.getByText('Rank', { exact: false })).toHaveCount(0);
  });

  test('/best-of shows no rank numbers over a column of zeros', async ({ page }) => {
    await setup(page);
    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });
    const list = page.getByRole('list').filter({ hasText: 'Best Pizza' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByText('No votes yet').first()).toBeVisible();
    await expect(list.getByText('Rank', { exact: false })).toHaveCount(0);
  });

  test('a 2-vote category emits no ItemList, is noindexed and never says "Best Best"', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [{ entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 2 }],
      },
    });

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Live results' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
      nodes.map((n) => {
        try {
          return String((JSON.parse(n.textContent || '{}') as { '@type'?: string })['@type'] ?? '');
        } catch {
          return '';
        }
      }),
    );
    expect(types).not.toContain('ItemList');
    expect(types).toContain('BreadcrumbList');
    expect(await page.content()).not.toMatch(/Best Best/);
  });

  test('the booth searches only visitable places and shows where they are', async ({ page }) => {
    const { searches } = await setup(page);

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });
    await page.getByRole('searchbox', { name: /search for a place/i }).fill('Jazz');
    await expect(page.getByRole('button', { name: /Jazz Kitchen/ })).toBeVisible({ timeout: 15_000 });

    const restaurants = searches.find((u) => u.includes('/rest/v1/restaurants?'));
    const attractions = searches.find((u) => u.includes('/rest/v1/attractions?'));
    expect(restaurants).toContain('is_merged=not.is.true');
    expect(restaurants).toMatch(/or=\(status\.is\.null,status\.not\.in\.\(closed,/);
    expect(restaurants).toMatch(/select=[^&]*city/);
    expect(attractions).toContain('is_active=eq.true');
    // The fixture row's location and city are both "Des Moines": printed once.
    await expect(page.getByRole('button', { name: /Jazz Kitchen/ })).toContainText(/restaurant - Des Moines/i);
  });

  test('/best-of passes axe (WCAG 2 A/AA)', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [{ entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 4 }],
      },
      winners: [{ category_id: PIZZA.id, category_name: PIZZA.name, entity_id: JAZZ_KITCHEN, vote_count: 4 }],
    });

    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('list').filter({ hasText: 'Best Pizza' })).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .include('[data-best-of-index]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
