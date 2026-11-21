import { test, expect, type Page, type Request } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The /restaurants hub (docs/page-plans/eat-drink.md, WP1).
 *
 * RUNS AGAINST FIXTURES. installFixtureBackend with restaurantTotal: 478 pages
 * rows through the RPC's own limit/offset, so "page 2" is rows 31-60 and the
 * pagination has something to page. It does not filter, on purpose, which is
 * why the sponsored assertion below reads the REQUEST (does the sponsored query
 * carry the cuisine?) rather than the cards.
 *
 * Test hooks are roles, hrefs and data-* attributes, never data-testid:
 * vite.config.ts strips data-testid from every build.
 */

const TOTAL = 478;
const BASE = 'https://desmoinesinsider.com';

/**
 * The cookie banner is fixed to the bottom of the viewport at z-[60] and sits
 * over Load More on a phone. A stored decision keeps it closed; cookie-consent
 * .spec.ts covers the banner itself (same seed as shell-mobile.spec.ts).
 */
async function seedConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
}

async function gotoHub(page: Page, path = '/restaurants') {
  await seedConsent(page);
  await installFixtureBackend(page, { restaurantTotal: TOTAL });
  await page.goto(path);
  await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);
}

function isSponsoredQuery(req: Request): boolean {
  const url = req.url();
  return url.includes('/rest/v1/restaurants') && url.includes('is_sponsored=eq.true');
}

test.describe('Restaurants hub: pagination reaches every row', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('desktop shows tabbable page links with real hrefs, and page 2 is rows 31-60', async ({ page }) => {
    await gotoHub(page);

    const nav = page.getByRole('navigation', { name: /pagination/i });
    for (const n of [1, 2, 3, 4, 5]) {
      const link = nav.getByRole('link', { name: String(n), exact: true });
      await expect(link).toHaveAttribute('href', new RegExp(`[?&]page=${n}(&|$)`));
    }
    await expect(nav.getByRole('link', { name: /next/i })).toHaveAttribute('href', /[?&]page=2/);

    await nav.getByRole('link', { name: '2', exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator('[data-results-count]')).toContainText(`Showing 31-60 of ${TOTAL}`);
  });

  test('at desktop width the ranked list shows all twenty and no toggle', async ({ page }) => {
    await gotoHub(page);
    const block = page.locator('[data-top-rated]');
    const rows = block.locator('ol > li');
    await expect(rows).toHaveCount(20);
    await expect(rows.nth(19)).toBeVisible();
    await expect(block.getByRole('button', { name: /show all/i })).toBeHidden();
  });

  test('page 1 renders no restaurant twice', async ({ page }) => {
    await gotoHub(page);
    const hrefs = await page
      .locator('#all-restaurants-heading')
      .locator('xpath=..')
      .locator('article h3 a')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

test.describe('Restaurants hub: mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // SEO-038: the ranked list leads the unfiltered hub, so the first restaurant
  // a phone sees is its first entry rather than the first grid card.
  test('a restaurant link is in the first viewport, above the bottom nav', async ({ page }) => {
    await gotoHub(page);
    const firstTitle = page.locator('[data-top-rated] ol a').first();
    await expect(firstTitle).toBeVisible();
    const box = await firstTitle.boundingBox();
    expect(box, 'first card title has a box').not.toBeNull();

    // The shell's fixed BottomNav covers the bottom of a phone viewport, so
    // "in the first viewport" means above its top edge, not above 844.
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    const navBox = (await bottomNav.count()) > 0 ? await bottomNav.first().boundingBox() : null;
    const limit = navBox ? navBox.y : 844;
    expect(box!.y + box!.height).toBeLessThanOrEqual(limit);
  });

  // WEB-UX-085: twenty single-column rows with the rule printed first put the
  // filters and the first photo card about 2,050px down at 390px. Below md the
  // list shows five; all twenty stay in the DOM for the prerender and the
  // ItemList, and the rule sits in a details element under the list.
  test('the ranked list shows five with a Show all 20, and the filters are one screen down', async ({ page }) => {
    await gotoHub(page);
    const block = page.locator('[data-top-rated]');
    const rows = block.locator('ol > li');
    await expect(rows).toHaveCount(20);
    const visibleRows = () =>
      rows.evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length);
    expect(await visibleRows()).toBe(5);

    const rule = block.locator('[data-selection-rule]');
    await expect(rule).toHaveCount(1);
    await expect(rule).toBeHidden();
    const ruleBelowList = await block.evaluate((el) => {
      const list = el.querySelector('ol');
      const details = el.querySelector('[data-selection-rule]')?.closest('details');
      return !!list && !!details && !!(list.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(ruleBelowList, 'the rule sits in a details element after the list').toBe(true);

    // "About one screen of scroll": scrolling down by one viewport brings the
    // filter bar and the first photo card into view above the bottom nav.
    const vh = page.viewportSize()!.height;
    const bottomNav = page.getByRole('navigation', { name: 'Bottom navigation' });
    const navBox = (await bottomNav.count()) > 0 ? await bottomNav.first().boundingBox() : null;
    const visibleBottom = navBox ? navBox.y : vh;
    const docTop = (selector: string) =>
      page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(await docTop('[data-hub-controls]')).toBeLessThan(vh + visibleBottom - 44);
    await expect(page.locator('article').first()).toBeAttached();
    expect(await docTop('article')).toBeLessThan(vh + visibleBottom - 120);

    const toggle = block.getByRole('button', { name: 'Show all 20' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    expect(await visibleRows()).toBe(20);
    await expect(block.getByRole('button', { name: 'Show top 5' })).toHaveAttribute('aria-expanded', 'true');

    await block.getByText('How this list is made').click();
    await expect(rule).toBeVisible();
  });

  test('Load More appends to 60 and keeps the loaded cards mounted', async ({ page }) => {
    await gotoHub(page);
    const cards = page.locator('article h3 a');
    await expect(cards).toHaveCount(30);

    await page.getByRole('button', { name: /load more/i }).click();
    // No skeleton swap: the first card never leaves while page 2 loads.
    await expect(page.getByRole('status', { name: /loading restaurants/i })).toHaveCount(0);
    await expect(cards).toHaveCount(60);
    await expect(page.locator('[data-results-count]')).toContainText(`Showing 60 of ${TOTAL}`);
  });
});

test.describe('Restaurants hub: honest controls', () => {
  test('no hub control writes ?open=1 and no text claims N open', async ({ page }) => {
    await gotoHub(page);
    const openNow = page.getByRole('link', { name: /^open now$/i }).first();
    await expect(openNow).toHaveAttribute('href', '/restaurants/open-now');
    await expect(page.getByText(/\d+\s+restaurants?\s+open/i)).toHaveCount(0);
    expect(page.url()).not.toMatch(/[?&]open=1/);
  });

  test('an old ?open=1 link gets a pointer to the open-now page, not a filter chip', async ({ page }) => {
    await gotoHub(page, '/restaurants?open=1');
    await expect(page.getByRole('status').filter({ hasText: /doesn't filter by hours/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /remove .*open now/i })).toHaveCount(0);
  });

  test('a cuisine filter reaches the sponsored query and hides the interstitials', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page, { restaurantTotal: TOTAL });
    const sponsored: string[] = [];
    page.on('request', (req) => {
      if (isSponsoredQuery(req)) sponsored.push(decodeURIComponent(req.url()));
    });
    await page.goto('/restaurants?cuisine=Mexican');
    await expect(page.locator('[data-results-count]')).toContainText(`of ${TOTAL}`);

    expect(sponsored.length).toBeGreaterThan(0);
    for (const url of sponsored) expect(url).toContain('cuisine=in.(Mexican)');

    await expect(page.getByRole('link', { name: /every new and upcoming restaurant/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /featured restaurants/i })).toHaveCount(0);
  });

  test('the map toggle is in the URL and pressed state is exposed', async ({ page }) => {
    await gotoHub(page);
    const mapButton = page.getByRole('button', { name: 'Map view' });
    await expect(mapButton).toHaveAttribute('aria-pressed', 'false');
    await mapButton.click();
    await expect(page).toHaveURL(/[?&]view=map/);
    await expect(mapButton).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Restaurants hub: copy, links and schema', () => {
  test('no invented claims, and one restaurant total on the page', async ({ page }) => {
    await gotoHub(page);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/over 200|real-time|48 hours|building permits|verified by local|unbiased|Django/i);
    expect(text).not.toMatch(/450\+/);
  });

  test('the directory links every way in', async ({ page }) => {
    await gotoHub(page);
    const nav = page.getByRole('navigation', { name: /browse des moines restaurants/i });
    for (const href of ['/restaurants/open-now', '/restaurants/new', '/restaurants/dietary', '/breweries']) {
      await expect(nav.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
    await expect(nav.locator('a[href^="/neighborhoods/"]').first()).toBeVisible();
  });

  test('ItemList points at our restaurant pages, and there is one BreadcrumbList', async ({ page }) => {
    await gotoHub(page);
    // The ItemList is the ranked list (SEO-038), which has its own query.
    await expect(page.locator('[data-top-rated] ol li').first()).toBeVisible();
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((el) => el.textContent || ''));
    const parsed = blocks.flatMap((b) => {
      try {
        const v = JSON.parse(b);
        return Array.isArray(v) ? v : [v];
      } catch {
        return [];
      }
    }) as Array<Record<string, unknown>>;

    const lists = parsed.filter((d) => d['@type'] === 'ItemList');
    expect(lists).toHaveLength(1);
    const items = lists[0].itemListElement as Array<{ url: string }>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.url.startsWith(`${BASE}/restaurants/`)).toBe(true);

    expect(parsed.filter((d) => d['@type'] === 'BreadcrumbList')).toHaveLength(1);
  });

  test('a filtered view emits no ItemList', async ({ page }) => {
    await gotoHub(page, '/restaurants?cuisine=Italian');
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((el) => el.textContent || ''));
    expect(types.some((t) => t.includes('"ItemList"'))).toBe(false);
  });
});

// WEB-PERF-078: the filter pills render without Radix Popover or Slider.
// RestaurantFilterPopover is fetched on the first pill interaction and swapped
// in already open; it must still open from the keyboard and give focus back.
test.describe('Restaurants hub: filter pills load their popover on use', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('no popover chunk with the page; click and Enter open it, Escape returns focus', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (req) => {
      if (/\/RestaurantFilterPopover-[^/]*\.js/.test(req.url())) chunks.push(req.url());
    });
    await gotoHub(page);

    const price = page.getByRole('button', { name: /^Price/ });
    await expect(price).toHaveAttribute('aria-expanded', 'false');
    const size = async () => {
      const box = await price.boundingBox();
      return box && { width: box.width, height: box.height };
    };
    const before = await size();
    expect(chunks, 'the popover chunk loaded with the page').toEqual([]);

    await price.click();
    const moderate = page.getByRole('button', { name: /^\$\$\s*moderate/ });
    await expect(moderate).toBeVisible();
    expect(chunks).toHaveLength(1);
    await expect(price).toHaveAttribute('aria-expanded', 'true');
    expect(await size()).toEqual(before);

    await page.keyboard.press('Escape');
    await expect(moderate).toBeHidden();
    await expect(price).toBeFocused();

    // A pill that was never opened swaps on Enter, which reaches it as a click.
    const rating = page.getByRole('button', { name: /^Rating/ });
    await rating.focus();
    await page.keyboard.press('Enter');
    const slider = page.getByRole('slider', { name: 'Minimum rating' });
    await expect(slider).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(slider).toBeHidden();
    await expect(rating).toBeFocused();
    expect(chunks).toHaveLength(1);
  });
});
