import { test, expect, Page } from '@playwright/test';

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

test.describe('Navigation Testing', () => {
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
      const navElement = page.locator(`a[href="${link.path}"]`).first();
      await navElement.click();
      await expect(page).toHaveURL(new RegExp(link.path));
      await expect(page).not.toHaveTitle(/404|Not Found/);
    }
  });

  test('should have working back button navigation', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/events"]');
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
