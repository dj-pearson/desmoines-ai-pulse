import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay WP5: Best-of voting.
 *
 * Every Supabase call is answered here. installFixtureBackend supplies the
 * restaurants/attractions rows the search and name lookups read; the voting
 * tables and RPCs are registered after it, so they win (Playwright matches the
 * most recently registered route first).
 *
 * RPC shapes are the real ones from the migrations:
 *   voting_category_tallies() -> { category_id, vote_count }[]      (20260822000013)
 *   voting_results(uuid)      -> { entity_type, entity_id, custom_entry, vote_count }[]
 *   voting_winners()          -> { category_id, category_name, entity_id, vote_count }[]  (20260823000001)
 */

const USER_ID = '00000000-0000-4000-8000-0000000000b1';
const DAY = 24 * 60 * 60 * 1000;

// Rows supplied by tests/support/fixtureBackend.ts.
const JAZZ_KITCHEN = '10000000-0000-0000-0000-000000000000';
const RESTAURANT_1 = '10000000-0000-0000-0000-000000000001';

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

function category(overrides: Partial<CategoryRow> & Pick<CategoryRow, 'id' | 'name' | 'slug'>): CategoryRow {
  return {
    description: 'Fixture category.',
    icon: 'trophy',
    is_active: true,
    voting_start: new Date(Date.now() - 30 * DAY).toISOString(),
    voting_end: new Date(Date.now() + 30 * DAY).toISOString(),
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const PIZZA = category({ id: 'c0000000-0000-4000-8000-000000000001', name: 'Best Pizza', slug: 'best-pizza' });
const COFFEE = category({ id: 'c0000000-0000-4000-8000-000000000002', name: 'Best Coffee', slug: 'best-coffee' });
const CLOSED = category({
  id: 'c0000000-0000-4000-8000-000000000003',
  name: 'Best Brunch',
  slug: 'best-brunch',
  voting_start: '2026-01-01T06:00:00Z',
  voting_end: '2026-01-31T18:00:00Z',
});

interface Setup {
  categories?: CategoryRow[];
  categoriesFail?: boolean;
  results?: Record<string, Array<{ entity_type: string; entity_id: string | null; custom_entry: string | null; vote_count: number }>>;
  winners?: Array<{ category_id: string; category_name: string; entity_id: string; vote_count: number }>;
  userVote?: Record<string, unknown> | null;
  failVote?: boolean;
}

interface VoteLog {
  writes: Array<{ method: string; url: string; body: unknown }>;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

function authStorageKey(): string {
  const url = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-placeholder-auth-token';
  }
}

/** Keeps the cookie banner off the booth. Shape from CookieConsentBanner. */
async function acceptCookies(page: Page) {
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
}

/** A session shaped the way supabase-js writes it (see subscription-checkout.spec.ts). */
async function seedSession(page: Page) {
  await page.addInitScript(
    ({ userId, storageKey }) => {
      const session = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'voter@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        /* private mode */
      }
    },
    { userId: USER_ID, storageKey: authStorageKey() },
  );
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/user')
      ? json(route, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'voter@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
      : json(route, {}),
  );
}

async function setup(page: Page, opts: Setup = {}): Promise<VoteLog> {
  const categories = opts.categories ?? [PIZZA, COFFEE, CLOSED];
  const log: VoteLog = { writes: [] };

  await acceptCookies(page);
  await installFixtureBackend(page);

  await page.route('**/rest/v1/voting_categories**', (route) => {
    if (opts.categoriesFail) return json(route, { code: 'XX000', message: 'backend down' }, 500);
    const url = new URL(route.request().url());
    const slugFilter = url.searchParams.get('slug');
    const rows = slugFilter
      ? categories.filter((c) => `eq.${c.slug}` === slugFilter)
      : categories;
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
    if (wantsObject) {
      return rows[0] ? json(route, rows[0]) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
    }
    return json(route, rows);
  });

  await page.route('**/rest/v1/votes**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      const wantsObject = (req.headers()['accept'] || '').includes('application/vnd.pgrst.object');
      const vote = opts.userVote ?? null;
      if (wantsObject) return vote ? json(route, vote) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
      return json(route, vote ? [vote] : []);
    }
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    log.writes.push({ method: req.method(), url: req.url(), body });
    if (opts.failVote) {
      return json(route, { code: '42501', message: 'new row violates row-level security policy for table "votes"' }, 403);
    }
    return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });

  await page.route('**/rest/v1/rpc/voting_category_tallies**', (route) =>
    json(
      route,
      Object.entries(opts.results ?? {}).map(([categoryId, rows]) => ({
        category_id: categoryId,
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

  return log;
}

test.describe('Best-of voting (Plan & Stay WP5)', () => {
  test('/best-of lists each category with its leader and closing date', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [
          { entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 20 },
          { entity_type: 'restaurant', entity_id: RESTAURANT_1, custom_entry: null, vote_count: 10 },
        ],
      },
      winners: [{ category_id: PIZZA.id, category_name: PIZZA.name, entity_id: JAZZ_KITCHEN, vote_count: 20 }],
    });

    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });

    const list = page.getByRole('list').filter({ hasText: 'Best Pizza' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByText('Leading: Jazz Kitchen (20 votes)')).toBeVisible();
    await expect(list.getByText('Best Coffee')).toBeVisible();
    await expect(list.getByText('No votes yet').first()).toBeVisible();
    await expect(list.getByText('Closed Jan 31, 2026').first()).toBeAttached();
    // Most votes first.
    await expect(list.getByRole('listitem').first()).toContainText('Best Pizza');
    // The year comes from voting_start, not a literal.
    await expect(page.getByText(/^Des Best \d{4}$/)).toBeVisible();
  });

  test('/best-of shows an error, not an empty list, when the backend is down', async ({ page }) => {
    await setup(page, { categoriesFail: true });
    await page.goto('/best-of', { waitUntil: 'domcontentloaded' });
    // The query retries a 5xx with backoff before giving up, hence the wait.
    await expect(page.getByRole('alert').filter({ hasText: /something went wrong|offline/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Voting opens soon')).toHaveCount(0);
  });

  test('a 3-vote category shows counts only, with no percentages or medals', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [
          { entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 2 },
          { entity_type: 'custom', entity_id: null, custom_entry: 'Fixture Write-in', vote_count: 1 },
        ],
      },
    });

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Live results' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Not enough votes yet/)).toBeVisible();
    const ranking = page.getByRole('list').filter({ hasText: 'Jazz Kitchen' });
    await expect(ranking.getByText('2 votes')).toBeVisible();
    await expect(ranking.getByText('Fixture Write-in')).toBeVisible();
    await expect(ranking.getByText(/\d+%/)).toHaveCount(0);
  });

  test('a closed category shows final results with its date and no booth', async ({ page }) => {
    await setup(page, {
      results: {
        [CLOSED.id]: [{ entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 4 }],
      },
    });

    await page.goto('/best-of/best-brunch', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Final results' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Voting closed', { exact: true })).toBeVisible();
    await expect(page.getByText(/Voting ended Jan 31, 2026/)).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });

  test('a signed-out pick survives sign-in and is confirmed with one request', async ({ page }) => {
    const log = await setup(page);

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });
    await page.getByRole('searchbox', { name: /search for a place/i }).fill('Jazz');
    await page.getByRole('button', { name: /Jazz Kitchen/ }).click();

    const signIn = page.getByRole('link', { name: 'Sign in to vote' }).first();
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', `/auth?redirect=${encodeURIComponent('/best-of/best-pizza')}`);
    expect(log.writes, 'a signed-out pick must not reach the votes table').toHaveLength(0);

    const stored = await page.evaluate(() => localStorage.getItem('pendingVote'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ categoryId: PIZZA.id, entityId: JAZZ_KITCHEN, name: 'Jazz Kitchen' });

    // Back from /auth, signed in.
    await seedSession(page);
    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });

    const confirm = page.getByRole('button', { name: 'Confirm vote for Jazz Kitchen' });
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await confirm.click();

    await expect.poll(() => log.writes.length).toBe(1);
    expect(log.writes[0].method).toBe('POST');
    expect(decodeURIComponent(log.writes[0].url)).toContain('on_conflict=category_id,user_id');
    expect(log.writes[0].body).toMatchObject({ category_id: PIZZA.id, entity_id: JAZZ_KITCHEN, user_id: USER_ID });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pendingVote'))).toBeNull();
  });

  test('changing a vote is one upsert, and a failed one leaves the old vote alone', async ({ page }) => {
    await seedSession(page);
    const log = await setup(page, {
      failVote: true,
      results: {
        [PIZZA.id]: [{ entity_type: 'restaurant', entity_id: RESTAURANT_1, custom_entry: null, vote_count: 1 }],
      },
      userVote: {
        id: 'd0000000-0000-4000-8000-000000000001',
        category_id: PIZZA.id,
        entity_type: 'restaurant',
        entity_id: RESTAURANT_1,
        custom_entry: null,
        user_id: USER_ID,
        created_at: '2026-09-01T00:00:00Z',
      },
    });

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Your vote:')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Fixture Restaurant 1').first()).toBeVisible();
    await expect(page.getByRole('list').filter({ hasText: 'Fixture Restaurant 1' }).getByText('Your vote', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('searchbox', { name: /search for a place/i }).fill('Jazz');
    await page.getByRole('button', { name: /Jazz Kitchen/ }).click();

    await expect(page.getByText('Vote not saved').first()).toBeVisible({ timeout: 10_000 });
    expect(log.writes, 'a vote change is a single request').toHaveLength(1);
    expect(log.writes[0].method).toBe('POST');
    expect(log.writes.some((w) => w.method === 'DELETE'), 'no delete may precede the write').toBe(false);

    await page.getByRole('button', { name: 'Keep my current vote' }).click();
    await expect(page.getByText('Your vote:')).toBeVisible();
  });

  test('the category page passes axe (WCAG 2 A/AA) with a ranked leaderboard', async ({ page }) => {
    await setup(page, {
      results: {
        [PIZZA.id]: [
          { entity_type: 'restaurant', entity_id: JAZZ_KITCHEN, custom_entry: null, vote_count: 20 },
          { entity_type: 'restaurant', entity_id: RESTAURANT_1, custom_entry: null, vote_count: 9 },
          { entity_type: 'custom', entity_id: null, custom_entry: 'Fixture Write-in', vote_count: 3 },
        ],
      },
    });

    await page.goto('/best-of/best-pizza', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Live results' })).toBeVisible({ timeout: 15_000 });
    // 32 votes: ranked, so medals carry an sr-only rank and the bar is hidden.
    await expect(page.getByText('Rank 1', { exact: true })).toBeAttached();

    const results = await new AxeBuilder({ page })
      .include('[data-best-of-category]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
