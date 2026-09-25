import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan WP1 (first pass items 2, 3 and 8; second pass items 7, 9, 13
 * and 14): the /events list appends, counts honestly, puts active sponsored
 * rows first wherever they sit in organic order, never repeats an id, says
 * when it is updating, reads like near me in near-me mode, and shows one set
 * of controls and a card on a phone's first screen.
 *
 * installFixtureBackend answers every events read with the same 12 rows, so
 * this spec registers its own events route AFTER it (the last registered
 * handler wins) with 75 rows that honour offset/limit and report the total in
 * content-range, which is what supabase-js reads a count from. It still does
 * not filter: which rows match is a query question, covered by
 * src/components/events/__tests__/eventsHubQuery.test.ts. The sponsored lead
 * query and near me's id read are answered from the same rows by what they
 * ask for (is_sponsored=eq.true, id=in.(...)), which is routing, not filtering.
 */

const TOTAL = 75;
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

function title(i: number) {
  return `Hub Fixture ${String(i).padStart(3, '0')}`;
}

function id(i: number) {
  return `40000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
}

function row(i: number) {
  const day = String(1 + (i % 28)).padStart(2, '0');
  return {
    id: id(i),
    title: title(i),
    category: 'Music',
    city: 'Des Moines',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    date: `2030-10-${day}T00:00:00Z`,
    end_date: null,
    enhanced_description: null,
    original_description: 'Supplied by events-hub-list.spec.ts',
    event_start_local: null,
    event_start_utc: `2030-10-${day}T00:00:00Z`,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: false,
    // Row 40 is an active sponsorship on page 2 of the organic order; row 7 is
    // active on page 1; row 8 expired. Both active ones lead.
    is_sponsored: i === 7 || i === 8 || i === 40,
    sponsored_until: i === 8 ? PAST : i === 7 || i === 40 ? FUTURE : null,
    latitude: 41.58,
    longitude: -93.62,
    location: 'Des Moines',
    price: i % 3 === 0 ? 'Free' : '$15',
    source_url: 'https://example.com/fixture',
    venue: `Venue ${i}`,
    writeup_generated_at: null,
  };
}

const ROWS = Array.from({ length: TOTAL }, (_, i) => row(i));
const SPONSORED = ROWS.filter((r) => r.is_sponsored && r.sponsored_until === FUTURE);

const CORS = {
  'access-control-allow-origin': '*',
  // The page is cross-origin to the API, so the browser hides content-range
  // from supabase-js unless it is exposed, and the count reads as null.
  'access-control-expose-headers': 'content-range',
};

function json(route: Route, body: unknown, range?: string) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: range ? { ...CORS, 'content-range': range } : CORS,
    body: JSON.stringify(body),
  });
}

/** The list query is the one that pages: it carries offset and limit. */
async function installPagedEvents(page: Page, options: { delayMs?: () => number } = {}) {
  await page.route('**/rest/v1/events?**', async (route: Route) => {
    const url = new URL(route.request().url());
    const delay = options.delayMs?.() ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (route.request().method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${TOTAL}` }, body: '' });
    }
    if (url.searchParams.get('is_sponsored') === 'eq.true') return json(route, SPONSORED);
    const ids = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')?.[1];
    if (ids) {
      const wanted = new Set(ids.split(',').map((s) => s.replace(/"/g, '')));
      return json(route, ROWS.filter((r) => wanted.has(r.id)));
    }
    const offset = url.searchParams.get('offset');
    if (offset === null) {
      // Tonight strip, indoor flags, anything else: nothing, so only the list renders cards.
      return json(route, []);
    }
    const limit = Number(url.searchParams.get('limit') ?? '0');
    const start = Number(offset);
    const slice = ROWS.slice(start, start + limit);
    const end = start + Math.max(slice.length, 1) - 1;
    return json(route, slice, `${start}-${end}/${TOTAL}`);
  });
}

// Card titles are h3, or h4 under a day header (WP2 headingLevel). An active
// sponsored card carries an sr-only "Sponsored: " inside its title link.
const cardTitles = (page: Page) =>
  page.locator('h3, h4').filter({ hasText: /^(Sponsored: )?Hub Fixture \d{3}$/ });

/**
 * A card's title link. Not the event-card-link test id: vite.config.ts strips
 * data-testid from every build, dev server included.
 */
const CARD_LINKS = 'h3 > a[href^="/events/"], h4 > a[href^="/events/"]';

/** A card title, with or without the sponsored prefix. */
const titleText = (i: number) => new RegExp(`^(Sponsored: )?${title(i)}$`);

const plainTitles = async (page: Page) =>
  (await cardTitles(page).allTextContents()).map((t) => t.replace(/^Sponsored: /, ''));

test.describe('/events list (WP1)', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
    await installPagedEvents(page);
  });

  test('counts honestly and appends on Load More', async ({ page }) => {
    await page.goto('/events');
    // Page 1 is 30 organic rows; row 7 is one of them and leads as sponsored,
    // row 40 (page 2) is pulled up beside it: 29 + 2 on screen.
    await expect(page.getByText(/31 of 75 events/).first()).toBeVisible({ timeout: 30_000 });
    await expect(cardTitles(page)).toHaveCount(31);
    const firstBefore = await cardTitles(page).first().textContent();

    await page.getByRole('button', { name: /load more events/i }).click();
    await expect(cardTitles(page)).toHaveCount(60);
    await expect(page.getByText(/60 of 75 events/).first()).toBeVisible();
    expect(await cardTitles(page).first().textContent()).toBe(firstBefore);
    await expect(page).toHaveURL(/[?&]page=2\b/);

    const titles = await plainTitles(page);
    expect(new Set(titles).size, 'an event rendered twice').toBe(titles.length);
  });

  test('a ?page=2 deep link loads both pages', async ({ page }) => {
    await page.goto('/events?page=2');
    await expect(cardTitles(page)).toHaveCount(60, { timeout: 30_000 });
    await expect(cardTitles(page).first()).toHaveText(titleText(7));
  });

  test('active sponsorships lead wherever they sit; an expired one does not', async ({ page }) => {
    await page.goto('/events');
    await expect(cardTitles(page).first()).toHaveText(titleText(7), { timeout: 30_000 });
    // Row 40 has 40 organic rows before it and is not on page 1 at all.
    await expect(cardTitles(page).nth(1)).toHaveText(titleText(40));
    await expect(cardTitles(page).nth(1)).toContainText('Sponsored');
    await expect(cardTitles(page).nth(2)).toHaveText(titleText(0));
    const titles = await plainTitles(page);
    expect(titles.indexOf(title(8))).toBe(9);
    expect(titles.filter((t) => t === title(7))).toHaveLength(1);
  });

  test('list/map is a pressed-state control backed by ?view=map', async ({ page }) => {
    await page.goto('/events');
    const map = page.getByRole('button', { name: 'Map', exact: true });
    await expect(map).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await map.click();
    await expect(page).toHaveURL(/[?&]view=map\b/);
    await expect(map).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /load more events/i })).toHaveCount(0);
  });
});

test.describe('/events says when it is updating (item 13)', () => {
  test('the old rows dim and the count reads "Updating..." until the new ones land', async ({ page }) => {
    let slow = false;
    await installFixtureBackend(page);
    await installPagedEvents(page, { delayMs: () => (slow ? 2_000 : 0) });
    await page.goto('/events');
    await expect(cardTitles(page).first()).toBeVisible({ timeout: 30_000 });

    slow = true;
    await page.getByRole('group', { name: 'Quick filters' }).getByRole('button', { name: 'Free' }).click();
    const list = page.locator('[data-hub-list]');
    await expect(list).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Updating...').first()).toBeVisible();
    await expect(list).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });
  });
});

test.describe('/events near me on the hub (item 7)', () => {
  test.use({
    geolocation: { latitude: 41.587654, longitude: -93.624321 },
    permissions: ['geolocation'],
  });

  test('distance order, no day headers, unique ids, a rounded origin', async ({ page }) => {
    await installFixtureBackend(page);
    await installPagedEvents(page);
    let body: Record<string, unknown> | null = null;
    await page.route('**/rest/v1/rpc/search_events_near_location', (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      // Featured-first order from the RPC; the page must re-sort by distance.
      const rows = [3, 1, 2].map((i, k) => ({ id: id(i), distance_meters: [900, 300, 600][k] }));
      return json(route, rows);
    });

    await page.goto('/events?near=1');
    await expect(cardTitles(page)).toHaveCount(3, { timeout: 30_000 });
    expect(await plainTitles(page)).toEqual([title(1), title(2), title(3)]);
    await expect(page.getByText(/Nearest 3 within 30 mi/).first()).toBeVisible();

    await expect(page.locator('h3[id^="events-day-"]')).toHaveCount(0);
    const dupes = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
      return ids.filter((x, i) => ids.indexOf(x) !== i);
    });
    expect(dupes, 'duplicate element ids').toEqual([]);

    expect(body).not.toBeNull();
    const decimals = (n: unknown) => (String(n).split('.')[1] ?? '').length;
    expect(decimals(body!.user_lat)).toBeLessThanOrEqual(2);
    expect(decimals(body!.user_lon)).toBeLessThanOrEqual(2);
  });
});

test.describe('/events on a phone (WP1 items 8 and 14)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
    await installPagedEvents(page);
  });

  test('the first card starts on the first screen', async ({ page }) => {
    await page.goto('/events');
    const first = cardTitles(page).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    // The card's top, not its title's: walk up to the card root.
    const top = await first.evaluate((el) => {
      const card = el.closest('.rounded-xl, [class*="card"]') ?? el;
      return card.getBoundingClientRect().top + window.scrollY;
    });
    expect(top, `first card starts at ${Math.round(top)}px`).toBeLessThan(560);
  });

  test('one Filters control and one List/Map control above the first card, no id twice', async ({ page }) => {
    await page.goto('/events');
    const first = cardTitles(page).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    const cardTop = await first.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

    const above = async (selector: string) =>
      page.locator(selector).evaluateAll(
        (els, top) =>
          els.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top + window.scrollY < (top as number);
          }).length,
        cardTop,
      );

    expect(await above('button:text-matches("^Filters", "i")')).toBe(1);
    expect(await above('[role="group"][aria-label="View"]')).toBe(1);

    const hrefs = await page.locator(CARD_LINKS).evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')),
    );
    expect(new Set(hrefs).size, 'an event rendered twice').toBe(hrefs.length);
  });
});
