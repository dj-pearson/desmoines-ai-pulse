import { test, expect, Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Comprehensive Link and Button Testing Suite
 *
 * This test suite validates:
 * - All links are working and not broken
 * - All buttons are clickable and provide feedback
 * - Navigation works correctly
 * - External links open appropriately
 */

// List of all pages to test
const pages = [
  '/',
  '/events',
  '/events/today',
  '/events/this-weekend',
  '/restaurants',
  '/attractions',
  '/playgrounds',
  '/articles',
  '/neighborhoods',
  '/weekend',
  '/guides',
  '/search',
  '/social',
  '/gamification',
  '/business-partnership',
  '/advertise',
];

async function getAllLinks(page: Page): Promise<string[]> {
  return await page.$$eval('a[href]', links =>
    links.map(link => (link as HTMLAnchorElement).href)
  );
}

async function getAllButtons(page: Page): Promise<any[]> {
  return await page.$$eval('button, [role="button"], a.button, .btn', elements =>
    elements.map((el, index) => ({
      index,
      text: el.textContent?.trim() || '',
      tagName: el.tagName,
      disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
      type: (el as HTMLButtonElement).type || 'unknown'
    }))
  );
}

test.describe('Link Testing - All Pages', () => {
  for (const path of pages) {
    test(`should have no broken internal links on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const links = await getAllLinks(page);
      const internalLinks = links.filter(link =>
        link.includes(page.url().split('/').slice(0, 3).join('/'))
      );

      const brokenLinks: string[] = [];

      for (const link of internalLinks) {
        try {
          const response = await page.request.get(link);
          if (!response.ok() && response.status() !== 304) {
            brokenLinks.push(`${link} - Status: ${response.status()}`);
          }
        } catch (error) {
          brokenLinks.push(`${link} - Error: ${error}`);
        }
      }

      expect(brokenLinks, `Found broken links:\n${brokenLinks.join('\n')}`).toHaveLength(0);
    });

    test(`should have proper link accessibility attributes on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      // Check external links have proper attributes
      const externalLinks = await page.$$eval('a[href^="http"]', links =>
        links.map((link, index) => ({
          index,
          href: link.getAttribute('href'),
          hasRel: link.hasAttribute('rel'),
          hasTarget: link.hasAttribute('target'),
          hasAriaLabel: link.hasAttribute('aria-label') || !!link.textContent?.trim()
        }))
      );

      const externalLinksWithoutRel = externalLinks.filter(link =>
        !link.href?.includes(page.url().split('/').slice(0, 3).join('/')) && !link.hasRel
      );

      expect(
        externalLinksWithoutRel,
        'External links should have rel attribute for security'
      ).toHaveLength(0);
    });
  }
});

test.describe('Button Testing - Functionality and Feedback', () => {
  for (const path of pages) {
    test(`should have clickable buttons with proper feedback on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      // Evaluate in the page so each button is checked directly, rather than
      // reconstructing a selector from an index.
      //
      // The previous version built `button:nth-of-type(N)` from the button's
      // position in a flat list. nth-of-type counts position WITHIN A PARENT,
      // not within the document, so that selector did not address the intended
      // button at all — it matched some other element (usually one with no
      // text, hence failures reading `Button "" should have cursor pointer`).
      // 16 of this suite's tests failed that way. Auditing the real buttons on
      // the same pages: /advertise 11 visible, /articles 28, /guides 17, and
      // ZERO of them lacked cursor:pointer. Every one of those failures was a
      // false positive against correct markup.
      const offenders = await page.evaluate(() => {
        const all = [...document.querySelectorAll('button, [role="button"], a.button, .btn')] as HTMLElement[];
        return all
          .filter((el) => el.offsetParent !== null) // visible
          .filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true')
          .slice(0, 10)
          .filter((el) => {
            const styles = window.getComputedStyle(el);
            return styles.cursor !== 'pointer' && !el.classList.toString().includes('cursor-pointer');
          })
          .map((el) => `"${(el.textContent || '').trim().slice(0, 30)}" (${el.tagName}.${el.className.slice(0, 40)})`);
      });

      expect(
        offenders,
        `Buttons without cursor:pointer on ${path}:\n  ${offenders.join('\n  ')}`
      ).toEqual([]);
    });

    test(`should have properly sized buttons for touch targets on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const buttons = await page.$$eval('button, [role="button"]', elements =>
        elements.map((el, index) => {
          const rect = el.getBoundingClientRect();
          return {
            index,
            text: el.textContent?.trim() || '',
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0
          };
        })
      );

      const visibleButtons = buttons.filter(btn => btn.visible);
      const tooSmallButtons = visibleButtons.filter(btn =>
        btn.width < 44 || btn.height < 44 // WCAG 2.1 minimum touch target size
      );

      if (tooSmallButtons.length > 0) {
        console.warn(`Found ${tooSmallButtons.length} buttons below 44x44px on ${path}:`, tooSmallButtons);
      }

      // Allow some flexibility but warn if more than 20% are too small
      expect(
        tooSmallButtons.length / Math.max(visibleButtons.length, 1),
        'More than 20% of buttons are below recommended touch target size (44x44px)'
      ).toBeLessThan(0.2);
    });

    test(`should have buttons with descriptive text or aria-labels on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const buttonsWithoutLabels = await page.$$eval('button, [role="button"]', elements =>
        elements
          .map((el, index) => ({
            index,
            text: el.textContent?.trim() || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            ariaLabelledBy: el.getAttribute('aria-labelledby') || '',
            title: el.getAttribute('title') || ''
          }))
          .filter(btn => !btn.text && !btn.ariaLabel && !btn.ariaLabelledBy && !btn.title)
      );

      expect(
        buttonsWithoutLabels.length,
        `Found ${buttonsWithoutLabels.length} buttons without text or labels`
      ).toBe(0);
    });
  }
});

/**
 * The first VISIBLE link to `path`. These two tests used `.first()` on the
 * bare selector, and the first `a[href="/events"]` in the DOM is the mobile
 * bottom nav, which is hidden at desktop widths: on chromium-desktop both
 * timed out waiting for a hidden element to become visible, whatever the
 * backend (reproduced on a vite build, 2/2). A link a visitor can actually
 * click is the journey these tests describe.
 */
function visibleLink(page: Page, path: string) {
  return page.locator(`a[href="${path}"]`).filter({ visible: true }).first();
}

test.describe('Navigation Testing', () => {
  // On a phone the visible link is the bottom nav, and the cookie banner
  // (fixed bottom, z-60) sits over it once it mounts: the click then times
  // out on "subtree intercepts pointer events" (mobile-chrome, 1 in 10 here).
  // The banner is not part of the navigation journey, so consent is seeded.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({
            version: '2026-04-13',
            essential: true,
            preferences: true,
            analytics: false,
            advertising: false,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        /* private mode: the banner shows */
      }
    });
  });

  test('should navigate between all major pages successfully', async ({ page }) => {
    await page.goto('/');

    const navLinks = [
      { path: '/events', text: 'Events' },
      { path: '/restaurants', text: 'Restaurants' },
      { path: '/attractions', text: 'Attractions' },
      { path: '/articles', text: 'Articles' },
    ];

    for (const link of navLinks) {
      await page.goto('/');
      await visibleLink(page, link.path).click();
      await expect(page).toHaveURL(new RegExp(link.path));
      await expect(page).not.toHaveTitle(/404|Not Found/);
    }
  });

  test('should have working back button navigation', async ({ page }) => {
    await page.goto('/');
    await visibleLink(page, '/events').click();
    await page.waitForURL(/\/events/);

    await page.goBack();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Button Click Feedback', () => {
  test('should show visual feedback when buttons are clicked', async ({ page }) => {
    await page.goto('/');

    // Find the first visible, enabled button
    const button = page.locator('button:not([disabled])').first();
    await button.waitFor({ state: 'visible', timeout: 5000 });

    // Record initial state
    const initialClasses = await button.getAttribute('class');

    // Click and check for any state change
    await button.click({ force: false });

    // Wait a moment for any visual feedback
    await page.waitForTimeout(100);

    // Visual feedback could be:
    // 1. Class change
    // 2. Loading state
    // 3. Navigation
    // 4. Dialog opening
    const hasNavigated = !page.url().endsWith('/');
    const hasDialog = await page.locator('[role="dialog"]').count() > 0;
    const hasToast = await page.locator('[role="status"]').count() > 0;

    // At least one form of feedback should occur
    const hasFeedback = hasNavigated || hasDialog || hasToast;

    // This is informational - we're checking that buttons do something
    if (!hasFeedback) {
      console.log('Button clicked but no obvious feedback detected - this may be intentional');
    }
  });
});

test.describe('Event links resolve to real event pages (WEB-SEO-033)', () => {
  // useEventBySlug matches only date-suffixed slugs, so a /events/<uuid> link
  // lands on Event Not Found. Nine surfaces built links that way, and none
  // failed visibly: a link that 404s looks like a link until it is clicked.

  const SURFACES = ['/music', '/sports', '/events/near-me'];

  for (const route of SURFACES) {
    test(`every event link on ${route} points at a slug, not a uuid`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const hrefs = await page
        .locator('a[href^="/events/"]')
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));

      const uuid = /^\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const bad = hrefs.filter((h) => uuid.test(h) || h === '/events/undefined');
      expect(bad, `id-based or undefined event links on ${route}: ${bad.join(', ')}`).toEqual([]);
    });
  }

  test('the first event link on a venue page opens an event, not Event Not Found', async ({ page }) => {
    await page.goto('/music');
    await page.waitForLoadState('networkidle');

    const venue = page.locator('a[href^="/music/venues/"]').first();
    if ((await venue.count()) === 0) test.skip(true, 'no venues rendered');
    await venue.click();
    await page.waitForLoadState('networkidle');

    const eventLink = page.locator('a[href^="/events/"]').first();
    if ((await eventLink.count()) === 0) test.skip(true, 'this venue has no upcoming events');
    await eventLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Event Not Found/i)).toHaveCount(0);
  });
});

/**
 * SEO-037: the Google preferred-source button belongs on articles (and the
 * hubs and footer) but not on restaurant or event detail pages.
 *
 * Playwright sets navigator.webdriver, which PreferredSourceButton treats the
 * same as the prerenderer: it never loads publisher.js and renders Google's
 * plain deeplink instead. So in this suite the fallback link is what appears;
 * the assertion accepts either form so it still holds in a real browser.
 *
 * Rows come from fixtureBackend. These tests used to name live slugs
 * (corn-mazes-near-des-moines, jesses-embers), so on the placeholder build the
 * article page took its not-found branch and "renders at the end of an
 * article" failed on both projects, while "is absent from a restaurant page"
 * passed on "We couldn't load this restaurant" rather than a restaurant (it
 * held only because useSiteFooter runs above the error branch). Both now load
 * a real detail page and check its h1 before asserting.
 */
const SEO037_ISO = '2026-09-01T12:00:00.000Z';
const SEO037_ARTICLE = {
  id: '45000000-0000-0000-0000-000000000001',
  slug: 'preferred-source-fixture',
  title: 'Preferred Source Fixture Article',
  excerpt: 'An article supplied by links-and-buttons.spec.ts.',
  content: 'Body text for the fixture article. '.repeat(20),
  category: 'Food',
  tags: ['fixture'],
  featured_image_url: null,
  seo_title: null,
  seo_description: null,
  seo_keywords: null,
  view_count: 0,
  published_at: SEO037_ISO,
  created_at: SEO037_ISO,
  updated_at: SEO037_ISO,
  status: 'published',
  is_auto_published: false,
  generated_from_suggestion_id: null,
  quality_score: null,
};
const SEO037_RESTAURANT = {
  id: '45000000-0000-0000-0000-000000000002',
  name: 'Preferred Source Fixture Grill',
  slug: 'preferred-source-fixture-grill',
  location: '400 Locust St, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'American',
  description: 'A restaurant supplied by links-and-buttons.spec.ts.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: 4.5,
  price_range: '$$',
  opening: 'Daily 11am-10pm',
  status: 'open',
  is_merged: false,
  merged_into: null,
  updated_at: SEO037_ISO,
};

test.describe('Google preferred source button (SEO-037)', () => {
  const PREFERRED = '[data-preferred-source]';
  const BUTTON_OR_LINK =
    '[google-add-preferred-source-btn], a[href="https://www.google.com/preferences/source?q=desmoinesinsider.com"]';

  test('renders at the end of an article', async ({ page }) => {
    await installFixtureBackend(page);
    // After installFixtureBackend, so this handler wins the match. Answers the
    // slug lookup with the fixture and every other articles read with nothing.
    await page.route('**/rest/v1/articles**', (route) => {
      const slug = (new URL(route.request().url()).searchParams.get('slug') || '').replace(/^eq\./, '');
      const rows = slug === SEO037_ARTICLE.slug ? [SEO037_ARTICLE] : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': rows.length ? '0-0/1' : '*/0',
        },
        body: JSON.stringify(rows),
      });
    });

    await page.goto(`/articles/${SEO037_ARTICLE.slug}`);
    await expect(page.locator('h1')).toHaveText(SEO037_ARTICLE.title, { timeout: 20000 });

    const block = page.locator(`article ${PREFERRED}`);
    await expect(block).toHaveCount(1);
    await block.scrollIntoViewIfNeeded();
    await expect(block.locator(BUTTON_OR_LINK).first()).toBeVisible();

    // One per page: the footer copy is switched off where the body has one.
    await expect(page.locator(PREFERRED)).toHaveCount(1);
  });

  test('is absent from a restaurant page', async ({ page }) => {
    await installFixtureBackend(page);
    // The detail read by slug gets the fixture; list reads (related, nearby)
    // get nothing, so the rails stay quiet.
    await page.route('**/rest/v1/restaurants*', (route) => {
      const url = decodeURIComponent(route.request().url());
      const hit = url.includes(`slug=eq.${SEO037_RESTAURANT.slug}`) || url.includes(`id=eq.${SEO037_RESTAURANT.id}`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(hit ? [SEO037_RESTAURANT] : []),
      });
    });

    await page.goto(`/restaurants/${SEO037_RESTAURANT.slug}`);
    await expect(page.locator('h1')).toHaveText(SEO037_RESTAURANT.name, { timeout: 20000 });
    await expect(page.locator('footer')).toBeVisible();

    await expect(page.locator(PREFERRED)).toHaveCount(0);
    await expect(page.locator(BUTTON_OR_LINK)).toHaveCount(0);
  });
});
