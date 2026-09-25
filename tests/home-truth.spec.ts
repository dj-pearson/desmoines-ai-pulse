import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';
import { NEIGHBORHOODS, NEIGHBORHOOD_ROUTES } from '../src/lib/neighborhoods';

/**
 * Home: what the crawler-facing content says (home pass-2 WP4,
 * docs/page-plans/home-pass2.md).
 *
 *   - The structured data is one graph: one WebSite, one WebPage and one
 *     Organization, linked by @id, and the FAQPage lists exactly the questions
 *     the page shows.
 *   - The dated snapshot prints the stubbed count with a <time datetime>, and
 *     on a failed count prints no paragraph and no "0".
 *   - On a Saturday, the snapshot's weekend number is the number
 *     /events/this-weekend shows for the same rows.
 *   - Every area chip links to a prerendered neighbourhood route, and a chip
 *     carries tonight's count from the Tonight rail's rows.
 *
 * Most tests set window.__DMI_PRERENDER__ (src/lib/isPrerender.ts), the flag
 * scripts/prerender.mjs sets, so every LazySection mounts at once: that is the
 * page a crawler gets, and it saves scrolling to the snapshot.
 *
 * Count queries are answered the way PostgREST answers them: a HEAD request
 * gets a Content-Range header and no body, and a GET with Prefer: count=exact
 * gets its rows plus the total in Content-Range. The fixtureBackend is
 * installed first and these handlers, registered after it, win for events.
 */

const ISO = '2026-09-01T00:00:00Z';

function eventRow(i: number, startUtc: string, extra: Record<string, unknown> = {}) {
  return {
    id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title: `Truth Fixture ${i}`,
    category: i % 2 === 0 ? 'Music' : 'Food',
    city: 'Des Moines',
    created_at: ISO,
    date: startUtc,
    end_date: null,
    enhanced_description: null,
    event_start_local: null,
    event_start_utc: startUtc,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5868,
    location: 'Des Moines',
    longitude: -93.625,
    original_description: 'A fixture event for the home truth spec.',
    price: i % 3 === 0 ? 'Free' : '$20',
    source_url: 'https://example.com/fixture',
    updated_at: ISO,
    venue: `Truth Venue ${i}`,
    writeup_generated_at: null,
    ...extra,
  };
}

/** Saturday 2026-09-26, 19:00 CDT. Inside this weekend on either clock below. */
const SATURDAY_EVENING_UTC = '2026-09-27T00:00:00Z';
const WEEKEND_ROWS = Array.from({ length: 9 }, (_, i) => eventRow(i, SATURDAY_EVENING_UTC));
const FREE_ROWS = WEEKEND_ROWS.filter((row) => /free/i.test(row.price));

const THURSDAY_4PM = new Date('2026-09-24T21:00:00Z'); // 16:00 CDT
const SATURDAY_1PM = new Date('2026-09-26T18:00:00Z'); // 13:00 CDT

/**
 * Content-Range is not a CORS-safelisted response header, so without the
 * expose line the browser hides it from supabase-js and every count reads as
 * null, which the snapshot (correctly) treats as a failure.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range',
};

interface EventsStub {
  rows: Record<string, unknown>[];
  /** Answer every count query with a PostgREST error instead. */
  failCounts?: boolean;
  onCount?: () => void;
}

/**
 * The events table. A count request is told the total of the rows it would
 * match: the free subset when its filter names price, all rows otherwise.
 */
function answerEvents(stub: EventsStub) {
  return (route: Route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const prefer = request.headers()['prefer'] ?? '';
    const isHead = request.method() === 'HEAD';

    if (prefer.includes('count=exact')) {
      stub.onCount?.();
      if (stub.failCounts) {
        return route.fulfill({
          // 400: shouldRetry does not retry a client error, so the failure
          // settles at once instead of after the retry budget.
          status: 400,
          contentType: 'application/json',
          headers: CORS,
          body: JSON.stringify({ code: 'PGRST100', message: 'stubbed failure' }),
        });
      }
      const matched = url.includes('price.ilike') ? FREE_ROWS.filter((r) => stub.rows.includes(r)) : stub.rows;
      const total = matched.length;
      if (isHead) {
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${total}` }, body: '' });
      }
      const limit = Number(new URL(request.url()).searchParams.get('limit') ?? total);
      const page = matched.slice(0, limit);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ...CORS, 'content-range': page.length ? `0-${page.length - 1}/${total}` : `*/${total}` },
        body: JSON.stringify(page),
      });
    }

    const headers = {
      ...CORS,
      'content-range': stub.rows.length ? `0-${stub.rows.length - 1}/${stub.rows.length}` : '*/0',
    };
    if (isHead) return route.fulfill({ status: 200, headers, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(stub.rows) });
  };
}

async function asCrawler(page: Page) {
  await page.addInitScript(() => {
    (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
  });
}

type Node = Record<string, unknown>;

async function jsonLdNodes(page: Page): Promise<Node[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const nodes: Node[] = [];
  for (const text of blocks) {
    const parsed = JSON.parse(text) as Node | Node[];
    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      if (Array.isArray(node['@graph'])) nodes.push(...(node['@graph'] as Node[]));
      else nodes.push(node);
    }
  }
  return nodes;
}

const ofType = (nodes: Node[], type: string) =>
  nodes.filter((n) => n['@type'] === type || (Array.isArray(n['@type']) && n['@type'].includes(type)));

const idOf = (value: unknown) => (value as { '@id'?: string } | undefined)?.['@id'];

test.describe('Home: truth in the crawler-facing content', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
  });

  test('structured data is one linked graph and the FAQ schema matches the page', async ({ page }) => {
    await page.clock.setFixedTime(THURSDAY_4PM);
    await asCrawler(page);
    await page.route('**/rest/v1/events?**', answerEvents({ rows: WEEKEND_ROWS }));
    await page.goto('/');

    // The ItemList rides with the snapshot, so wait for the paragraph and
    // then for Helmet to flush the head (it commits a frame later).
    await expect(page.locator('[data-speakable]')).toBeVisible();
    await expect.poll(async () => ofType(await jsonLdNodes(page), 'ItemList').length).toBe(1);

    const nodes = await jsonLdNodes(page);
    const [site, ...extraSites] = ofType(nodes, 'WebSite');
    const [webPage, ...extraPages] = ofType(nodes, 'WebPage');
    const [org, ...extraOrgs] = ofType(nodes, 'Organization');
    expect(site, 'one WebSite').toBeTruthy();
    expect(webPage, 'one WebPage').toBeTruthy();
    expect(org, 'one Organization').toBeTruthy();
    expect(extraSites).toHaveLength(0);
    expect(extraPages).toHaveLength(0);
    expect(extraOrgs).toHaveLength(0);

    expect(idOf(webPage.isPartOf)).toBe(site['@id']);
    expect(idOf(site.publisher)).toBe(org['@id']);
    expect(idOf(webPage.publisher)).toBe(org['@id']);

    // The descriptions describe what ships.
    expect(JSON.stringify([site.description, webPage.description])).not.toMatch(
      /real-time|personali[sz]ed recommendations/i,
    );
    // Speakable points at the dated paragraph only.
    expect((webPage.speakable as { cssSelector: string[] }).cssSelector).toEqual(['[data-speakable]']);

    // An ItemList of the linked events, absolute URLs.
    const [list] = ofType(nodes, 'ItemList');
    expect(list, 'ItemList with the snapshot').toBeTruthy();
    const items = list.itemListElement as { url: string; position: number }[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.url).toMatch(/^https?:\/\/[^/]+\/events\/truth-fixture-\d+/);

    const [faq] = ofType(nodes, 'FAQPage');
    expect(faq, 'FAQPage').toBeTruthy();
    const faqSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Des Moines: Frequently Asked Questions' }) })
      .last();
    const visible = await faqSection.locator('details').count();
    expect(visible).toBeGreaterThan(0);
    expect((faq.mainEntity as unknown[]).length).toBe(visible);
  });

  test('the snapshot prints the stubbed counts with a dated <time>', async ({ page }) => {
    await page.clock.setFixedTime(THURSDAY_4PM);
    await asCrawler(page);
    await page.route('**/rest/v1/events?**', answerEvents({ rows: WEEKEND_ROWS }));
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Des Moines this weekend' })).toBeVisible();
    const paragraph = page.locator('[data-speakable]');
    await expect(paragraph).toContainText('As of Thursday, September 24 (Central)');
    await expect(paragraph).toContainText(
      `${WEEKEND_ROWS.length} events this weekend, ${FREE_ROWS.length} of them listed as free`,
    );
    await expect(paragraph).toContainText('(Friday, September 25 - Sunday, September 27)');
    await expect(paragraph.locator('time')).toHaveAttribute('datetime', '2026-09-24');
    await expect(paragraph.getByRole('link', { name: /events this weekend/ })).toHaveAttribute(
      'href',
      '/events/this-weekend',
    );
    await expect(paragraph.getByRole('link', { name: 'all free events' })).toHaveAttribute('href', '/events/free');
    // Thursday: there is no "still to come" clause.
    await expect(paragraph).not.toContainText('still to come');
  });

  test('a failed count renders no paragraph and no zero', async ({ page }) => {
    let counts = 0;
    await page.clock.setFixedTime(THURSDAY_4PM);
    await asCrawler(page);
    await page.route(
      '**/rest/v1/events?**',
      answerEvents({ rows: WEEKEND_ROWS, failCounts: true, onCount: () => counts++ }),
    );
    await page.goto('/');

    const listings = page.getByRole('heading', { name: 'How these listings are made' });
    await expect(listings).toBeVisible();
    await expect.poll(() => counts).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-speakable]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Des Moines this weekend' })).toHaveCount(0);
    const article = page.locator('article').filter({ has: listings });
    expect(await article.innerText()).not.toMatch(/\b0\b/);
    const nodes = await jsonLdNodes(page);
    expect(ofType(nodes, 'ItemList')).toHaveLength(0);
  });

  test('on a Saturday the weekend number is the number /events/this-weekend shows', async ({ page }) => {
    await page.clock.setFixedTime(SATURDAY_1PM);
    await asCrawler(page);
    await page.route('**/rest/v1/events?**', answerEvents({ rows: WEEKEND_ROWS }));
    await page.goto('/');

    const paragraph = page.locator('[data-speakable]');
    await expect(paragraph).toContainText('As of Saturday, September 26 (Central)');
    const text = await paragraph.innerText();
    const snapshotWeekend = Number(/(\d+) events? this weekend/.exec(text)?.[1]);
    const snapshotFree = Number(/(\d+) of them listed as free/.exec(text)?.[1]);
    expect(text).toMatch(/\d+ still to come today and Sunday/);

    await page.goto('/events/this-weekend');
    const tile = (label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::div[1]');
    await expect(tile('Weekend Events')).toHaveText(String(snapshotWeekend));
    await expect(tile('Free Events')).toHaveText(String(snapshotFree));
  });

  test('every area chip links to a prerendered neighbourhood route', async ({ page }) => {
    await page.clock.setFixedTime(THURSDAY_4PM);
    await page.route('**/rest/v1/events?**', answerEvents({ rows: [] }));
    await page.goto('/');

    const strip = page.getByRole('region', { name: 'Explore by area' });
    await expect(strip).toBeVisible();
    const hrefs = await strip.locator('a[data-area-chip]').evaluateAll((links) =>
      links.map((a) => a.getAttribute('href')),
    );
    expect(hrefs).toHaveLength(NEIGHBORHOODS.length);
    for (const href of hrefs) expect(NEIGHBORHOOD_ROUTES).toContain(href);
  });

  test('an area chip carries tonight\'s count from the Tonight rail\'s rows', async ({ page }) => {
    await page.clock.setFixedTime(THURSDAY_4PM);
    // 19:00 CDT tonight, in Ankeny. Not the prerender: tonight's numbers are
    // left out of the frozen HTML on purpose.
    const tonight = Array.from({ length: 3 }, (_, i) =>
      eventRow(100 + i, '2026-09-25T00:00:00Z', { city: 'Ankeny', location: 'Ankeny', price: '$10' }),
    );
    await page.route('**/rest/v1/events?**', answerEvents({ rows: tonight }));
    await page.goto('/');

    const strip = page.getByRole('region', { name: 'Explore by area' });
    await expect(strip.locator('a[data-area-chip="ankeny"]')).toHaveText('Ankeny, 3 tonight');
    await expect(strip.locator('a[data-area-chip="waukee"]')).toHaveText('Waukee');
  });
});
