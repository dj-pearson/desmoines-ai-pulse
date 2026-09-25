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
