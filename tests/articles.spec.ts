import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Plan & Stay WP4: /articles and /articles/:slug (docs/page-plans/plan-stay.md).
 *
 * 1. /articles makes exactly one GET /rest/v1/articles on load, with
 *    status=eq.published and no `content` column; "Load more" asks for the
 *    next 12 by offset.
 * 2. An is_auto_published article carries the AI badge on its card and on its
 *    page, and the page's notice does not claim human review.
 * 3. With /rest/v1 aborted, an article URL shows Retry, not "Article Not Found".
 * 4. The handler-less buttons (Save, Like, Yes, Feedback, Explore More Topics)
 *    are gone from both routes.
 *
 * The articles route is registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match. It honours offset/limit and
 * the slug filter; it does not filter or sort otherwise.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const TOTAL = 15;

function article(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `43000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    slug: `fixture-article-${i}`,
    title: `Fixture Article ${i}`,
    excerpt: 'An article supplied by articles.spec.ts.',
    content: 'Body text for the fixture article. '.repeat(40),
    category: i % 2 === 0 ? 'Food' : 'Events',
    tags: ['patio', 'fixture'],
    featured_image_url: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
    view_count: i,
    published_at: ISO,
    created_at: ISO,
    updated_at: ISO,
    status: 'published',
    is_auto_published: false,
    generated_from_suggestion_id: null,
    ...extra,
  };
}

const AUTO = article(0, {
  slug: 'auto-published-patios',
  title: 'Auto Published Patio Guide',
  is_auto_published: true,
});

const ROWS = [AUTO, ...Array.from({ length: TOTAL - 1 }, (_, i) => article(i + 1))];

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

interface Seen {
  url: URL;
  method: string;
}

async function installArticles(page: Page): Promise<Seen[]> {
  const seen: Seen[] = [];
  await installFixtureBackend(page);
  await page.route('**/rest/v1/articles**', (route) => {
    const url = new URL(route.request().url());
    seen.push({ url, method: route.request().method() });
    const params = url.searchParams;
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');

    const slug = (params.get('slug') || '').replace(/^eq\./, '');
    if (slug) {
      const row = ROWS.find((r) => r.slug === slug);
      if (wantsObject) {
        return row
          ? reply(route, 200, row, '0-0/1')
          : route.fulfill({
              status: 406,
              contentType: 'application/json',
              headers: { 'access-control-allow-origin': '*' },
              body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
            });
      }
      // maybeSingle() on a GET reads an array and checks its length.
      return reply(route, 200, row ? [row] : [], row ? '0-0/1' : '*/0');
    }

    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit') || ROWS.length);
    const rows = ROWS.slice(offset, offset + limit);
    const range = rows.length > 0 ? `${offset}-${offset + rows.length - 1}/${ROWS.length}` : `*/${ROWS.length}`;
    return reply(route, 200, rows, range);
  });
  return seen;
}

function selectedColumns(url: URL): string[] {
  return (url.searchParams.get('select') || '').split(',').map((c) => c.trim());
}

const DEAD_BUTTONS = /^(Save|Like|Yes|Feedback|Explore More Topics|Subscribe to Newsletter)$/;

test.describe('articles list', () => {
  test('one lean, published-only request on load, then Load more pages by offset', async ({ page }) => {
    const seen = await installArticles(page);
    await page.goto('/articles');

    await expect(page.getByRole('link', { name: /Auto Published Patio Guide/ })).toBeVisible();
    // Let any stray mount effect fire before counting.
    await page.waitForLoadState('networkidle');

    const listGets = seen.filter((s) => s.method === 'GET' && !s.url.searchParams.get('slug'));
    // The hub-rail query (related reading) is an article-detail concern; the
    // list page issues exactly one request of its own.
    expect(listGets).toHaveLength(1);
    const [first] = listGets;
    expect(first.url.searchParams.get('status')).toBe('eq.published');
    expect(selectedColumns(first.url)).not.toContain('content');
    expect(selectedColumns(first.url)).not.toContain('*');

    const more = page.getByRole('button', { name: /Load more/ });
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.getByRole('link', { name: `Fixture Article ${TOTAL - 1}` })).toBeVisible();

    const afterMore = seen.filter((s) => s.method === 'GET' && !s.url.searchParams.get('slug'));
    expect(afterMore).toHaveLength(2);
    expect(afterMore[1].url.searchParams.get('offset')).toBe('12');
    await expect(more).toBeHidden();
  });

  test('an auto-published card carries the AI badge', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles');
    const card = page.getByRole('link', { name: /Auto Published Patio Guide/ });
    await expect(card).toBeVisible();
    await expect(card.getByText('AI-written')).toBeVisible();
    await expect(page.getByRole('link', { name: /Fixture Article 1\b/ }).getByText('AI-written')).toHaveCount(0);
  });

  test('no handler-less buttons', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles');
    await expect(page.getByRole('link', { name: /Auto Published Patio Guide/ })).toBeVisible();
    await expect(page.getByRole('button', { name: DEAD_BUTTONS })).toHaveCount(0);
  });
});

test.describe('article detail', () => {
  test('an auto-published article discloses AI without claiming editor review', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles/auto-published-patios');

    await expect(page.getByRole('heading', { level: 1, name: 'Auto Published Patio Guide' })).toBeVisible();
    await expect(page.getByText('AI-written').first()).toBeVisible();
    const notice = page.getByRole('note', { name: 'AI content disclosure' });
    await expect(notice).toContainText('not reviewed by an editor');
    await expect(notice).not.toContainText('reviewed by a human editor');
    await expect(page.getByRole('button', { name: DEAD_BUTTONS })).toHaveCount(0);
  });

  test('a network failure shows Retry, not "Article Not Found"', async ({ page }) => {
    await page.route('**://*.supabase.co/**', (route) => route.abort('failed'));
    await page.route('**/rest/v1/**', (route) => route.abort('failed'));
    await page.goto('/articles/fixture-article-3');

    await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Article Not Found')).toHaveCount(0);
  });

  test('a missing slug is not found and noindex', async ({ page }) => {
    await installArticles(page);
    await page.goto('/articles/no-such-article');
    await expect(page.getByRole('heading', { name: 'Article Not Found' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]').last()).toHaveAttribute('content', /noindex/);
  });
});
