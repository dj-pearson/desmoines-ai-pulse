import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Events plan WP1 items 2, 3 and 8: the /events list appends, counts honestly,
 * puts active sponsored rows first, never repeats an id, and shows a card on a
 * phone's first screen.
 *
 * installFixtureBackend answers every events read with the same 12 rows, so
 * this spec registers its own events route AFTER it (the last registered
 * handler wins) with 75 rows that honour offset/limit and report the total in
 * content-range, which is what supabase-js reads a count from. It still does
 * not filter: which rows match is a query question, covered by
 * src/components/events/__tests__/eventsHubQuery.test.ts.
 */

const TOTAL = 75;
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

function title(i: number) {
  return `Hub Fixture ${String(i).padStart(3, '0')}`;
}

function row(i: number) {
  const day = String(1 + (i % 28)).padStart(2, '0');
  return {
    id: `40000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
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
    // active on page 1; row 8 expired. Only page-1 sponsorship is boosted.
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

/** The list query is the one that pages: it carries offset and limit. */
async function installPagedEvents(page: Page) {
  await page.route('**/rest/v1/events?**', (route: Route) => {
    const url = new URL(route.request().url());
    // The page is cross-origin to the API, so the browser hides content-range
    // from supabase-js unless it is exposed, and the count reads as null.
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    };
    const offset = url.searchParams.get('offset');
    const limit = Number(url.searchParams.get('limit') ?? '0');
    if (route.request().method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `*/${TOTAL}` }, body: '' });
    }
    if (offset === null) {
      // Tonight strip, indoor flags, anything else: nothing, so only the list renders cards.
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '[]' });
    }
    const start = Number(offset);
    const slice = ROWS.slice(start, start + limit);
    const end = start + Math.max(slice.length, 1) - 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...headers, 'content-range': `${start}-${end}/${TOTAL}` },
      body: JSON.stringify(slice),
    });
  });
}

// An active sponsored card carries an sr-only "Sponsored: " inside its title
// link (WP3 item 2), so the title text is matched with that prefix allowed.
const cardTitles = (page: Page) =>
  page.locator('h3').filter({ hasText: /^(Sponsored: )?Hub Fixture \d{3}$/ });

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
    await expect(page.getByText(/30 of 75 events/).first()).toBeVisible({ timeout: 30_000 });
    await expect(cardTitles(page)).toHaveCount(30);
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

  test('an active page-1 sponsorship leads; an expired one does not', async ({ page }) => {
    await page.goto('/events');
    await expect(cardTitles(page).first()).toHaveText(titleText(7), { timeout: 30_000 });
    await expect(cardTitles(page).nth(1)).toHaveText(titleText(0));
    const titles = await plainTitles(page);
    expect(titles.indexOf(title(8))).toBe(8);
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

test.describe('/events on a phone (WP1 item 8)', () => {
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
});
