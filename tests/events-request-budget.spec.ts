import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * First-view request budget for the events routes (docs/page-plans/events-pass2.md
 * WP6 item 5).
 *
 * request-budget.spec.ts caps any ONE endpoint at 20 calls per load, which
 * catches a loop but not a page that makes fourteen different reads before the
 * visitor scrolls. This counts every Supabase request (REST, RPC and edge
 * function; preflights excluded) on an anonymous first view with no scroll,
 * and holds each route to a ceiling.
 *
 * MEASURED 2026-09-25 against a `vite build` of this branch, chromium-desktop,
 * 1366x768, clock pinned to Fri Sep 25 12:00 CDT. WP1-WP5 were landing in the
 * same tree while this was measured; if a number moves when they settle,
 * re-measure with EVENTS_BUDGET_REPORT=1 and write the new one here.
 *
 *   /events       10  events x4, get_active_ads x2 (top_banner, and
 *                     below_fold, which mounts before any scroll),
 *                     event_attendees, event_live_stats, subscription_plans,
 *                     fn:weather
 *   /events/today  4  events, event_attendees, event_live_stats, fn:weather
 *   detail        11  events x5, get_content_view_stats x4 (one per related
 *                     EventCard: useViewTracking has no batch form), venues,
 *                     restaurants
 *
 * Each ceiling is the measured count, not the count plus headroom. A new read
 * on first view should be a decision somebody makes in this file, not
 * something that fits under slack. Run with EVENTS_BUDGET_REPORT=1 to print
 * the per-endpoint breakdown when a number moves.
 *
 * Runs on the fixture backend, so every query succeeds and nothing retries:
 * one query is one request. HEAD counts get a readable Content-Range (the
 * shared fixture does not expose it, and a count that reads as null is
 * retried, which would count three requests for one query). Consent is seeded
 * so the banner does not change what mounts.
 */

const CEILINGS: Record<string, number> = {
  '/events': 10,
  '/events/today': 4,
  '/events/jazz-night-at-the-fixture-2026-10-01': 11,
};

/** Fri 2026-09-25 12:00 CDT. The fixture events (Oct 1) are upcoming. */
const NOW = new Date('2026-09-25T17:00:00Z');

const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

function seedConsent(page: Page) {
  return page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode: the assertions fail, not this */
    }
  }, CONSENT);
}

/** Answer every HEAD count with a Content-Range the browser can read. */
function answerCounts(page: Page) {
  return page.route('**/rest/v1/**', (route) => {
    if (route.request().method() !== 'HEAD') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
        'content-range': '0-11/12',
      },
      body: '',
    });
  });
}

/** The fixture backend's first event, which the detail slug below names. */
const JAZZ = {
  id: '20000000-0000-0000-0000-000000000000',
  title: 'Jazz Night at the Fixture',
  description: 'An event supplied by tests/support/fixtureBackend.',
  original_description: 'An event supplied by tests/support/fixtureBackend.',
  category: 'Music',
  date: '2026-10-01',
  event_start_utc: '2026-10-01T19:00:00Z',
  end_date: null,
  location: 'Des Moines',
  venue: 'Fixture Venue 0',
  city: 'Des Moines',
  image_url: null,
  price: 'Free',
  is_featured: true,
  latitude: 41.58,
  longitude: -93.62,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** Twelve rows: JAZZ plus eleven more on the following days. */
const ROWS = [
  JAZZ,
  ...Array.from({ length: 11 }, (_, i) => ({
    ...JAZZ,
    id: `20000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    title: `Fixture Event ${i + 1}`,
    category: i % 2 === 0 ? 'Food' : 'Music',
    date: `2026-10-${String(i + 2).padStart(2, '0')}`,
    event_start_utc: `2026-10-${String(i + 2).padStart(2, '0')}T19:00:00Z`,
    venue: `Fixture Venue ${i + 1}`,
    price: '$15',
    is_featured: false,
  })),
];

/**
 * Events reads, answered here rather than by the shared fixture, which
 * ignores filters and limits. Two things that matter to a request count:
 *
 * - `.eq("id", ...).maybeSingle()` on the detail page got all twelve rows and
 *   failed client-side with PGRST116, which then fired log-error - a request
 *   the real page does not make. An id filter gets the row it names.
 * - `limit` is honoured, so the detail page's related-events rail renders the
 *   4 cards RELATED_EVENTS_LIMIT asks for, not 12. Each EventCard makes its
 *   own get_content_view_stats call (useViewTracking), so an ignored limit
 *   turned 4 real requests into 12 fake ones.
 */
function answerEvents(page: Page) {
  return page.route('**/rest/v1/events?**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const id = params.get('id');
    let rows = ROWS;
    if (id?.startsWith('eq.')) rows = ROWS.filter((r) => `eq.${r.id}` === id);
    const limit = Number(params.get('limit'));
    if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
    const wantsObject = (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-range': rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    };
    if (wantsObject) {
      return rows.length > 0
        ? route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows[0]) })
        : route.fulfill({
            status: 406,
            contentType: 'application/json',
            headers,
            body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
          });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(rows) });
  });
}

async function countFirstView(page: Page, path: string) {
  const counts = new Map<string, number>();
  page.on('request', (req) => {
    if (req.method() === 'OPTIONS') return;
    const m = req.url().match(/\/(rest|functions)\/v1\/(rpc\/)?([^?/]+)/);
    if (!m) return;
    const key = `${m[1] === 'functions' ? 'fn:' : m[2] ? 'rpc:' : ''}${m[3]}${req.method() === 'HEAD' ? ' (HEAD)' : ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  if (process.env.EVENTS_BUDGET_REPORT) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[events-budget] ${path} console: ${msg.text().slice(0, 300)}`);
    });
    page.on('request', (req) => {
      if (/log-error/.test(req.url())) console.log(`[events-budget] ${path} log-error: ${(req.postData() ?? '').slice(0, 600)}`);
    });
  }

  await page.clock.setFixedTime(NOW);
  await seedConsent(page);
  await installFixtureBackend(page);
  await answerCounts(page);
  await answerEvents(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  // Long enough for every first-view query to have fired; no scrolling.
  await page.waitForTimeout(6_000);
  return counts;
}

test.describe('events first-view request budget', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const [path, ceiling] of Object.entries(CEILINGS)) {
    test(`${path} makes at most ${ceiling} Supabase requests before a scroll`, async ({ page }) => {
      const counts = await countFirstView(page, path);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const detail = [...counts.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, n]) => `${k} x${n}`)
        .join(', ');

      if (process.env.EVENTS_BUDGET_REPORT) console.log(`[events-budget] ${path}: ${total} -> ${detail}`);

      expect(counts.get('fn:nlp-search') ?? 0, `nlp-search called on first view of ${path}: ${detail}`).toBe(0);
      expect(total, `first view of ${path} made ${total} Supabase requests: ${detail}`).toBeLessThanOrEqual(ceiling);
    });
  }
});
