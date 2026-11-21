import { test, expect, type Page } from '@playwright/test';

/**
 * WEB-A11Y-002. Every reader-facing route needs exactly one <h1>, including
 * when its data fails to load.
 *
 * Measured against a production build: /auth had no <h1> at all - CardTitle
 * renders an <h3>, so the document jumped straight to h3 - and /events and
 * /articles lost theirs whenever their data failed, because the error branch
 * is an early return that sits above the page's own heading.
 *
 * axe never caught this: page-has-heading-one is a best-practice rule, outside
 * the wcag2a/wcag2aa tag set that tests/accessibility.spec.ts filters to.
 */

const ROUTES = [
  '/', '/events', '/restaurants', '/attractions', '/playgrounds',
  '/music', '/sports', '/articles', '/deals', '/auth', '/pricing', '/contact',
  // The rest of the sign-up funnel (docs/page-plans/account.md WP6 item 3).
  // Each renders its own state with no session: verified and callback show
  // their no-token branch, reset-password its expired-link branch, and every
  // branch has to keep a single h1.
  '/auth/verified', '/auth/reset-password', '/auth/callback',
  // Where businesses and organizers pay or contribute
  // (docs/page-plans/business.md WP5 item 2). Signed out, /submit-event shows
  // its sign-in branch, which must keep the page's h1 like the form does.
  '/advertise', '/business-partnership', '/submit-event',
];

async function headings(page: Page) {
  return page.evaluate(() => ({
    h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent ?? '').trim()).filter(Boolean),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
    title: document.title,
  }));
}

for (const route of ROUTES) {
  test(`${route} has exactly one h1`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForTimeout(3_000);

    const { h1 } = await headings(page);
    expect(h1, `${route} rendered ${h1.length} <h1> elements: ${JSON.stringify(h1)}`).toHaveLength(1);
  });
}

test.describe('with the backend unreachable', () => {
  const FAILING = ['/events', '/articles'];

  for (const route of FAILING) {
    test(`${route} keeps its h1 and is not indexable`, async ({ page }) => {
      await page.route('**://*.supabase.co/**', (r) => r.abort('failed'));
      await page.route('**/rest/v1/**', (r) => r.abort('failed'));
      await page.route('**/functions/v1/**', (r) => r.abort('failed'));

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
      await page.waitForTimeout(15_000); // TanStack retries have to run out

      const { h1, robots, title } = await headings(page);

      expect(h1, `${route} lost its h1 in the error state`).toHaveLength(1);

      // A page whose title now announces the failure must not be indexable:
      // Googlebot crawling during a blip would otherwise index the site's main
      // hub as "Unable to Load Events" until the next crawl.
      if (/unable to load|went wrong|error/i.test(title)) {
        expect(robots, `${route} serves "${title}" as an indexable page`).toContain('noindex');
      }
    });
  }
});

// WEB-QA-060. WCAG 1.3.1: no route's outline may jump a level
// (h1 -> h3). The check lived only in accessibility.spec.ts, in the broad lane
// that does not gate a merge, and covered eight routes; on a vite build with
// the placeholder backend seven routes skipped. Six were ErrorState, whose
// title was an h3 rendered straight under the page's h1, so every hub that
// failed to load broke the outline; the seventh was /contact's CardTitle
// cards. The outline is sampled in the page every 200ms until it has held
// still for 3s with nothing aria-busy (or 20s pass: the home page keeps one
// region busy for good when the backend is down), and a skip seen at ANY
// sample fails, so the loading, error and loaded states are all read, not only
// the one that happens to be up when a fixed wait ends.
const OUTLINE_ROUTES = [
  ...ROUTES,
  '/events/today', '/events/this-weekend', '/events/free', '/events/kids',
  '/events/date-night', '/restaurants/open-now', '/restaurants/dietary',
  '/this-does-not-exist',
];

for (const route of OUTLINE_ROUTES) {
  test(`${route} never skips a heading level`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeAttached({ timeout: 30_000 });

    const skips = await page.evaluate(
      ({ quietMs, maxMs }) =>
        new Promise<string[]>((resolve) => {
          const seen = new Set<string>();
          let last = '';
          let quietSince = performance.now();
          const start = quietSince;
          const sample = () => {
            const outline = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
              .filter((h) => !h.closest('[hidden], [aria-hidden="true"]'))
              .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').trim().slice(0, 50) }));
            let prev = 0;
            for (const h of outline) {
              if (h.level - prev > 1) seen.add(`h${prev} -> h${h.level} ("${h.text}")`);
              prev = h.level;
            }
            const key = outline.map((h) => `${h.level}${h.text}`).join('|');
            const busy = !!document.querySelector('[aria-busy="true"]');
            const now = performance.now();
            if (key !== last || busy) quietSince = now;
            last = key;
            if (now - quietSince >= quietMs || now - start >= maxMs) {
              clearInterval(timer);
              resolve([...seen]);
            }
          };
          const timer = setInterval(sample, 200);
          sample();
        }),
      { quietMs: 3_000, maxMs: 20_000 },
    );

    expect(skips, `${route} skipped a heading level`).toEqual([]);
  });
}

// The catch-all 404 rendered a CardTitle (an h3) as its only heading, with no
// header or footer, so a dead link stranded the reader with no nav or search.
test('/this-does-not-exist has exactly one h1 and the site nav', async ({ page }) => {
  await page.goto('/this-does-not-exist', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('h1')).toContainText('Page not found');
  await expect(page.locator('header')).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /search the site/i })).toHaveAttribute('href', '/search');
});

// WCAG 2.4.1. The skip link targets <main>, which since WEB-UX-041 follows the
// header instead of wrapping it, so focusing it cannot land on the logo.
test('the skip link moves keyboard focus past the header', async ({ page }) => {
  await page.goto('/events', { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toHaveCount(1, { timeout: 30_000 });

  // focus() rather than a first Tab: the cookie banner and accessibility
  // widget can sit ahead of it in tab order depending on consent state.
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main-content')).toBeFocused();
  await page.keyboard.press('Tab');

  // The site header is the banner landmark; a page hero may be a <header> of
  // its own inside <main>, so closest('header') would over-match.
  const inHeader = await page.evaluate(() => {
    const siteHeader = document.querySelector('body header:not(main header)');
    const active = document.activeElement;
    return !siteHeader || !active || active === document.body || siteHeader.contains(active);
  });
  expect(inHeader, 'Tab after the skip link did not land in page content').toBe(false);
});

// WEB-UX-041. Pages rendered <Header>/<Footer> inside App's <main>, and a
// <header> or <footer> inside <main> is not a banner or contentinfo landmark,
// so the site had neither. SiteLayout now renders them as siblings of <main>.
// The detail slugs do not exist: the not-found branch still gets the chrome.
const LANDMARK_ROUTES = [
  '/', '/events', '/restaurants', '/music', '/advertise',
  '/events/no-such-event', '/restaurants/no-such-restaurant', '/this-does-not-exist',
];

for (const route of LANDMARK_ROUTES) {
  test(`${route} has one banner and one contentinfo, both outside <main>`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

    await expect(page.getByRole('banner')).toHaveCount(1, { timeout: 15_000 });
    // The footer is lazy; wait for it rather than reading the count once.
    await expect(page.getByRole('contentinfo')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByRole('main')).toHaveCount(1);

    const inMain = await page.evaluate(() => {
      const main = document.querySelector('main');
      const banner = document.querySelector('body header:not(main header)');
      const footer = document.querySelector('body footer:not(main footer)');
      return {
        banner: !banner || !!main?.contains(banner),
        footer: !footer || !!main?.contains(footer),
        headerInMain: !!main?.querySelector(':scope header[class~="sticky"]'),
        footerInMain: !!main?.querySelector('footer[aria-labelledby="site-footer-heading"]'),
      };
    });
    expect(inMain, `${route}: site header or footer is inside <main>`).toEqual({
      banner: false, footer: false, headerInMain: false, footerInMain: false,
    });
  });
}

// The opt-out: routes that rendered no site chrome before the move still do not.
test('/auth renders no site header or footer', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
});
