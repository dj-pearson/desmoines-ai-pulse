import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay pass 2 WP4: /articles, /articles/:slug and /whats-new
 * (docs/page-plans/plan-stay-pass2.md).
 *
 * 1. The loading branch of an article page already carries its canonical.
 * 2. No "views" text and no "Most Popular" option anywhere; ?sort=popular asks
 *    the server for newest first.
 * 3. A pipeline draft a person published (quality_score set,
 *    is_auto_published false) shows the AI badge and the "published by a
 *    person" notice.
 * 4. A category first seen on page 3 of the list is in the dropdown on load.
 * 5. Search asks for tags too; the toggles say which is pressed; Filters says
 *    whether it is open; a failed list keeps the search box and filters.
 * 6. Body links: site paths route in-app, other hosts get nofollow noopener.
 * 7. /whats-new: a restaurant the lookup did not return, or a merged one,
 *    renders no link; no card links /restaurants/<uuid>; a closed one says
 *    "Now closed"; ItemList entries carry a URL; failed counts show every chip.
 *
 * Routes are registered AFTER installFixtureBackend, which the fixture
 * documents as the way to win the match. The articles route honours
 * offset/limit and the slug filter and nothing else, on purpose.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const TOTAL = 30;
const PAGE_THREE_CATEGORY = 'Page Three Only';

function article(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `44000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    slug: `pass2-article-${i}`,
    title: `Pass Two Article ${i}`,
    excerpt: 'An article supplied by articles-pass2.spec.ts.',
    content: 'Body text for the fixture article. '.repeat(20),
    // Index 27 sits on page 3 of 12-card pages and is the only row with it.
    category: i === 27 ? PAGE_THREE_CATEGORY : i % 2 === 0 ? 'Food' : 'Events',
    tags: ['fixture'],
    featured_image_url: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    view_count: 0,
    published_at: ISO,
    created_at: ISO,
    updated_at: ISO,
    status: 'published',
    is_auto_published: false,
    generated_from_suggestion_id: null,
    quality_score: null,
    ...extra,
  };
}

const SCORED = article(0, {
  slug: 'scored-draft',
  title: 'Scored Pipeline Draft',
  quality_score: 72,
  is_auto_published: false,
  content: [
    'First paragraph of the scored draft.',
    '',
    'See [the open-now list](/restaurants/open-now) or [the menu](https://example.com/menu).',
  ].join('\n'),
});

const ROWS = [SCORED, ...Array.from({ length: TOTAL - 1 }, (_, i) => article(i + 1))];

function reply(route: Route, status: number, body: unknown, range: string) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-range': range,
  };
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status, headers, body: '' });
  }
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
}

interface ArticleRoutes {
  seen: URL[];
  /** Resolve to let a held slug request answer. */
  release: () => void;
}

async function installArticles(page: Page, opts: { holdSlug?: boolean; failList?: boolean } = {}): Promise<ArticleRoutes> {
  const seen: URL[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installFixtureBackend(page);
  await page.route('**/rest/v1/articles**', async (route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const params = url.searchParams;

    const slug = (params.get('slug') || '').replace(/^eq\./, '');
    if (slug) {
      if (opts.holdSlug) await held;
      const row = ROWS.find((r) => r.slug === slug);
      return reply(route, 200, row ? [row] : [], row ? '0-0/1' : '*/0');
    }

    const isCategoryList = params.get('select') === 'category';
    if (opts.failList && !isCategoryList) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ code: 'XX000', message: 'fixture failure' }),
      });
    }

    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit') || ROWS.length);
    const rows = ROWS.slice(offset, offset + limit);
    const range = rows.length > 0 ? `${offset}-${offset + rows.length - 1}/${ROWS.length}` : `*/${ROWS.length}`;
    return reply(route, 200, rows, range);
  });
  return { seen, release };
}

function isListGet(url: URL): boolean {
  return !url.searchParams.get('slug') && url.searchParams.get('select') !== 'category';
}

test.describe('articles, pass 2', () => {
  test('the loading state already declares the canonical', async ({ page }) => {
    const { release } = await installArticles(page, { holdSlug: true });
    await page.goto('/articles/scored-draft', { waitUntil: 'domcontentloaded' });

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('link[rel="canonical"]')).map((l) => l.getAttribute('href') || ''),
          ),
        { timeout: 15_000 },
      )
      .toEqual([expect.stringMatching(/\/articles\/scored-draft$/)]);
    await expect(page.getByRole('heading', { level: 1, name: 'Scored Pipeline Draft' })).toHaveCount(0);
    release();
    await expect(page.getByRole('heading', { level: 1, name: 'Scored Pipeline Draft' })).toBeVisible();
  });

  test('no view counts and no Most Popular; ?sort=popular asks for newest', async ({ page }) => {
    const { seen } = await installArticles(page);
    await page.goto('/articles?sort=popular');
    await expect(page.getByRole('link', { name: 'Scored Pipeline Draft', exact: true })).toBeVisible();

    const listGets = seen.filter(isListGet);
    expect(listGets.length).toBeGreaterThan(0);
    expect(listGets[0].searchParams.get('order') || '').toMatch(/^published_at\.desc/);
    expect(listGets.some((u) => (u.searchParams.get('order') || '').includes('view_count'))).toBe(false);

    await expect(page.getByText(/\bviews\b/i)).toHaveCount(0);
    await expect(page.locator('#articles-sort')).toContainText('Newest First');
    await page.locator('#articles-sort').click();
    await expect(page.getByRole('option', { name: 'Newest First' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Most Popular' })).toHaveCount(0);
  });

  test('a scored draft published by a person carries the badge and the notice', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles');
    await expect(page.getByRole('note', { name: 'AI-assisted', exact: true })).toHaveCount(1);

    await page.goto('/articles/scored-draft');
    await expect(page.getByRole('heading', { level: 1, name: 'Scored Pipeline Draft' })).toBeVisible();
    await expect(page.getByText('AI-assisted').first()).toBeVisible();
    const notice = page.getByRole('note', { name: 'AI content disclosure' });
    await expect(notice).toContainText('published by a person on our team');
    await expect(notice).not.toContainText('trained on public data');
    await expect(page.getByText(/\b\d+ views\b/)).toHaveCount(0);
  });

  test('a category first seen on page 3 is in the dropdown on load', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles');
    await expect(page.getByRole('link', { name: 'Scored Pipeline Draft', exact: true })).toBeVisible();
    // Only page 1 of cards is loaded.
    await expect(page.getByRole('link', { name: 'Pass Two Article 27', exact: true })).toHaveCount(0);

    await page.locator('#articles-category').click();
    await expect(page.getByRole('option', { name: PAGE_THREE_CATEGORY })).toBeVisible();
  });

  test('search asks for tags; toggles and Filters expose their state', async ({ page }) => {
    const { seen } = await installArticles(page);
    await page.goto('/articles');
    await expect(page.getByRole('link', { name: 'Scored Pipeline Draft', exact: true })).toBeVisible();

    const grid = page.getByRole('button', { name: 'Grid view' });
    const list = page.getByRole('button', { name: 'List view' });
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await expect(list).toHaveAttribute('aria-pressed', 'false');
    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');

    const filters = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
    await expect(filters).toHaveAttribute('aria-controls', 'articles-filters');
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('searchbox', { name: 'Search articles' }).fill('patio');
    await expect
      .poll(() => seen.some((u) => (u.searchParams.get('or') || '').includes('tags.cs.{patio}')))
      .toBe(true);
  });

  test('a failed list keeps the search box and the filters', async ({ page }) => {
    await installArticles(page, { failList: true });
    await page.goto('/articles');
    await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: /Des Moines Stories/ })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search articles' })).toBeVisible();
    await expect(page.locator('#articles-category')).toBeVisible();
  });

  test('body links: site paths in-app, other hosts nofollow', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles/scored-draft');
    const internal = page.getByRole('link', { name: 'the open-now list' });
    await expect(internal).toHaveAttribute('href', '/restaurants/open-now');
    await expect(internal).not.toHaveAttribute('rel', /nofollow/);
    const external = page.getByRole('link', { name: /the menu/ });
    await expect(external).toHaveAttribute('href', 'https://example.com/menu');
    await expect(external).toHaveAttribute('rel', 'nofollow noopener');
    await expect(page.locator('.article-content > p').first()).toContainText('First paragraph');
  });
});

// ---------------------------------------------------------------------------
// /whats-new
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const LIVE_ID = '53000000-0000-0000-0000-000000000001';
const GONE_ID = '53000000-0000-0000-0000-000000000002';
const MERGED_ID = '53000000-0000-0000-0000-000000000003';
const CLOSED_ID = '53000000-0000-0000-0000-000000000004';

function update(i: number, title: string, entityId: string | null) {
  return {
    id: `54000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    body: 'A scene update supplied by articles-pass2.spec.ts.',
    update_type: 'new_opening',
    entity_type: entityId ? 'restaurant' : null,
    entity_id: entityId,
    image_url: null,
    source_url: null,
    neighborhood: null,
    publish_date: new Date(now - (i + 1) * DAY).toISOString(),
  };
}

const UPDATES = [
  update(0, 'Live Diner opens', LIVE_ID),
  update(1, 'Gone Grill opens', GONE_ID),
  update(2, 'Merged Cafe opens', MERGED_ID),
  update(3, 'Closed Kitchen opens', CLOSED_ID),
  update(4, 'Unlinked note', null),
];

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function installFeed(page: Page, opts: { failCounts?: boolean } = {}) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/scene_updates**', (route) => {
    if (route.request().method() === 'HEAD') {
      const url = new URL(route.request().url());
      const type = (url.searchParams.get('update_type') || '').replace(/^eq\./, '');
      const n = UPDATES.filter((u) => !type || u.update_type === type).length;
      return route.fulfill({
        status: opts.failCounts ? 500 : 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': `*/${n}`,
        },
        body: '',
      });
    }
    return json(route, UPDATES);
  });
  await page.route('**/rest/v1/restaurants**', (route) => {
    const url = new URL(route.request().url());
    if ((url.searchParams.get('select') || '').replace(/\s/g, '') === 'id,slug,status,is_merged') {
      // GONE_ID is deliberately not returned.
      return json(route, [
        { id: LIVE_ID, slug: 'live-diner', status: 'open', is_merged: false },
        { id: MERGED_ID, slug: 'merged-cafe', status: 'open', is_merged: true },
        { id: CLOSED_ID, slug: 'closed-kitchen', status: 'closed', is_merged: false },
      ]);
    }
    return route.fallback();
  });
}

test.describe("what's new, pass 2", () => {
  test('links only restaurants that resolve, never by uuid', async ({ page }) => {
    await installFeed(page);
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: 'Live Diner opens', exact: true })).toHaveAttribute(
      'href',
      '/restaurants/live-diner',
      { timeout: 15_000 },
    );
    await expect(page.getByRole('heading', { name: 'Gone Grill opens' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gone Grill opens' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Merged Cafe opens' })).toHaveCount(0);
    await expect(page.locator('a[href^="/restaurants/5"]')).toHaveCount(0);

    // Still linked, but no longer labelled "New".
    const closed = page.locator('[data-whats-new] .relative', {
      has: page.getByRole('link', { name: 'Closed Kitchen opens' }),
    });
    await expect(closed.getByText('Now closed', { exact: true })).toBeVisible();
    await expect(closed.getByText('New', { exact: true })).toHaveCount(0);
  });

  test('ItemList entries carry a URL, and unlinked updates are left out', async ({ page }) => {
    await installFeed(page);
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Live Diner opens', exact: true })).toBeVisible({ timeout: 15_000 });

    const itemList = await page.evaluate(() => {
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const parsed = JSON.parse(s.textContent || '');
          if (parsed['@type'] === 'ItemList') return parsed;
        } catch {
          /* not JSON */
        }
      }
      return null;
    });
    expect(itemList).not.toBeNull();
    const entries = itemList.itemListElement as Array<{ name: string; url?: string; position: number }>;
    expect(entries.map((e) => e.name)).toEqual(['Live Diner opens', 'Closed Kitchen opens']);
    expect(entries.every((e) => typeof e.url === 'string' && /\/restaurants\/[a-z-]+$/.test(e.url))).toBe(true);
    expect(entries.map((e) => e.position)).toEqual([1, 2]);
  });

  test('failed counts show every chip rather than none', async ({ page }) => {
    await installFeed(page, { failCounts: true });
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Live Diner opens', exact: true })).toBeVisible({ timeout: 15_000 });
    const group = page.getByRole('group', { name: 'Filter updates by type' });
    await expect(group.getByRole('button')).toHaveText(
      ['All updates', 'New openings', 'Closings', 'Renovations', 'Expansions', 'News'],
      { timeout: 20_000 },
    );
  });
});
