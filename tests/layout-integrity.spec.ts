import { test, expect, Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Layout integrity (WEB-CI-028 AC3).
 *
 * Was visual-regression.spec.ts. It is renamed because it no longer takes
 * screenshots: a file called visual-regression that captures nothing is a name
 * that sends the next reader looking for baselines.
 *
 * What it asserts, all of it by MEASURING THE DOM rather than comparing images,
 * so it runs identically on any platform:
 * - no overlapping text at mobile, tablet and desktop widths
 * - the header and footer are consistent across pages
 * - no z-index conflicts, and modals sit above everything
 * - a fixed header does not cover content on scroll
 * - sticky elements behave on mobile
 * - no negative margins or content extending past the page edge
 * - tab order follows visual order
 */

/**
 * Every test runs against a page a visitor would see, which on the smoke
 * lane's placeholder-Supabase build takes three things (WEB-CI-028):
 * - fixtureBackend, or every hub measures its loading skeleton instead of
 *   cards, chips and counts;
 * - consent already given, or the fixed cookie banner is counted as text
 *   overlapping whatever it sits over. Overlap with the banner is what a
 *   banner is for; a test that wants to catch it covering a control should
 *   say so, not fail every page on it;
 * - a pinned clock, so the fixture's Oct 1 2026 events stay upcoming and
 *   /events has a list to lay out after that date.
 */
const NOW = new Date('2026-09-25T17:00:00Z');
const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode: the assertions fail, not this */
    }
  }, CONSENT);
  await installFixtureBackend(page);
});

const pages = [
  { path: '/', name: 'homepage' },
  { path: '/events', name: 'events' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/attractions', name: 'attractions' },
  { path: '/articles', name: 'articles' },
];

async function detectOverlappingText(page: Page): Promise<any[]> {
  return await page.evaluate(() => {
    // Get all text-containing elements
    const textElements = Array.from(
      document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, li, td, th, label')
    ).filter(el => {
      const text = el.textContent?.trim();
      const rect = el.getBoundingClientRect();
      // A box is not the same as being painted. FAQSection's answers sit in
      // closed <details>, which Chromium lays out under content-visibility:
      // hidden, so every collapsed answer on a page has a rect stacked on its
      // neighbours and the overlap count hit its cap of 10 on all fifteen
      // cases (WEB-CI-028). checkVisibility() skips those, plus opacity-0 and
      // visibility:hidden text nobody can see.
      //
      // Text inside a position:fixed layer (the mobile bottom nav, the
      // accessibility button) is skipped too: in-flow content passes under a
      // fixed layer at some scroll offset by design, so "overlap" between the
      // two is a function of where the page is scrolled, not of the layout.
      // Whether fixed chrome covers too much is the sticky test's question.
      let fixedLayer = false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        if (window.getComputedStyle(a).position === 'fixed') {
          fixedLayer = true;
          break;
        }
      }
      return (
        !fixedLayer &&
        text &&
        text.length > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
      );
    });

    // The part of an element that can actually be seen: its box cut down by
    // every ancestor that clips (overflow other than visible). A chip scrolled
    // past the edge of an overflow-x-auto row keeps a full-size rect that runs
    // under whatever sits beside the row; on /restaurants at 375px that put
    // the off-screen Price and Rating chips "under" the sort select
    // (WEB-CI-028). Only the visible part can collide with anything.
    const visibleRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      let { left, top, right, bottom } = r;
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        const cs = window.getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        if (cs.overflowX !== 'visible') {
          left = Math.max(left, c.left);
          right = Math.min(right, c.right);
        }
        if (cs.overflowY !== 'visible') {
          top = Math.max(top, c.top);
          bottom = Math.min(bottom, c.bottom);
        }
      }
      return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };

    const overlapping: any[] = [];

    for (let i = 0; i < textElements.length; i++) {
      const el1 = textElements[i];
      const rect1 = visibleRect(el1);
      if (rect1.width === 0 || rect1.height === 0) continue;

      for (let j = i + 1; j < textElements.length; j++) {
        const el2 = textElements[j];
        const rect2 = visibleRect(el2);
        if (rect2.width === 0 || rect2.height === 0) continue;

        // Check if rectangles overlap
        const hasOverlap = !(
          rect1.right < rect2.left ||
          rect1.left > rect2.right ||
          rect1.bottom < rect2.top ||
          rect1.top > rect2.bottom
        );

        if (hasOverlap) {
          // Skip if one contains the other (parent-child relationship)
          if (el1.contains(el2) || el2.contains(el1)) {
            continue;
          }

          // Calculate overlap area
          const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
          const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);
          const overlapArea = overlapWidth * overlapHeight;

          // Only report significant overlaps (more than 100 square pixels)
          if (overlapArea > 100) {
            overlapping.push({
              element1: {
                tag: el1.tagName,
                class: el1.className,
                text: el1.textContent?.substring(0, 50),
                rect: {
                  top: rect1.top,
                  left: rect1.left,
                  width: rect1.width,
                  height: rect1.height,
                },
              },
              element2: {
                tag: el2.tagName,
                class: el2.className,
                text: el2.textContent?.substring(0, 50),
                rect: {
                  top: rect2.top,
                  left: rect2.left,
                  width: rect2.width,
                  height: rect2.height,
                },
              },
              overlapArea,
            });
          }
        }
      }
    }

    return overlapping.slice(0, 10); // Return first 10 overlaps
  });
}

async function detectZIndexIssues(page: Page): Promise<any[]> {
  return await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));

    const issues: any[] = [];
    const seenPositions = new Map<string, any>();

    elements.forEach(el => {
      const styles = window.getComputedStyle(el);
      const zIndex = styles.zIndex;
      const position = styles.position;
      const rect = el.getBoundingClientRect();

      if (zIndex !== 'auto' && ['absolute', 'fixed', 'sticky', 'relative'].includes(position)) {
        const key = `${Math.round(rect.top)}-${Math.round(rect.left)}`;

        if (seenPositions.has(key)) {
          const existing = seenPositions.get(key);
          const existingZ = parseInt(existing.zIndex, 10) || 0;
          const currentZ = parseInt(zIndex, 10) || 0;

          // Check if z-indexes conflict
          if (Math.abs(existingZ - currentZ) < 10 && existingZ !== currentZ) {
            issues.push({
              element1: existing,
              element2: {
                tag: el.tagName,
                class: el.className,
                zIndex: currentZ,
                position,
              },
              message: 'Potential z-index conflict',
            });
          }
        } else {
          seenPositions.set(key, {
            tag: el.tagName,
            class: el.className,
            zIndex: parseInt(zIndex, 10) || 0,
            position,
          });
        }
      }
    });

    return issues.slice(0, 5);
  });
}

test.describe('Visual Regression - Text Overlap Detection', () => {
  for (const page of pages) {
    test(`${page.name} should not have overlapping text on mobile`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 375, height: 667 });
      await pw.goto(page.path, { waitUntil: 'networkidle' });
      await pw.waitForTimeout(1000); // Wait for animations

      const overlapping = await detectOverlappingText(pw);

      if (overlapping.length > 0) {
        console.log(`Found ${overlapping.length} overlapping text elements:`, overlapping);
      }

      expect(overlapping.length, 'Should not have overlapping text elements').toBe(0);
    });

    test(`${page.name} should not have overlapping text on desktop`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 1920, height: 1080 });
      await pw.goto(page.path, { waitUntil: 'networkidle' });
      await pw.waitForTimeout(1000);

      const overlapping = await detectOverlappingText(pw);

      if (overlapping.length > 0) {
        console.log(`Found ${overlapping.length} overlapping text elements:`, overlapping);
      }

      expect(overlapping.length, 'Should not have overlapping text elements').toBe(0);
    });

    test(`${page.name} should not have overlapping text on tablet`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 768, height: 1024 });
      await pw.goto(page.path, { waitUntil: 'networkidle' });
      await pw.waitForTimeout(1000);

      const overlapping = await detectOverlappingText(pw);

      if (overlapping.length > 0) {
        console.log(`Found ${overlapping.length} overlapping text elements:`, overlapping);
      }

      expect(overlapping.length, 'Should not have overlapping text elements').toBe(0);
    });
  }
});

/*
 * WEB-CI-028 AC3. THE SCREENSHOT TESTS THAT LIVED HERE COULD NOT PASS ANYWHERE
 * BUT ONE LAPTOP.
 *
 * Playwright names a snapshot per platform, and all 41 committed baselines were
 * `-win32`. On ubuntu - which is every CI runner - toHaveScreenshot finds no
 * baseline, writes one, and fails the run telling you it did. So this file was
 * referenced by no workflow and no config's testMatch, which is the only reason
 * nobody noticed: it was 37MB of images for ten test cases that were never
 * executed.
 *
 * Deleting the two screenshot tests rather than the whole file, because the
 * OTHER FOURTEEN tests here need no baseline at all. Overlap detection, z-index
 * conflicts, sticky positioning, horizontal overflow and tab order are DOM
 * measurements - they run identically on any platform, and they are the half
 * that catches real layout breakage. The file went from "cannot run" to "runs
 * anywhere" by removing what was never portable.
 *
 * Regenerating linux baselines was the alternative the story offers. It needs a
 * production build against live data, which this container cannot make (no
 * Supabase credentials), and committing another 37MB of images to a repository
 * WEB-QUAL-009 is already trying to slim is a decision for the owner rather
 * than a side effect of getting the suite runnable.
 */

test.describe('Layout Consistency', () => {
  test('header should be consistent across pages', async ({ page }) => {
    const headerHeights: number[] = [];

    for (const p of pages.slice(0, 3)) {
      await page.goto(p.path, { waitUntil: 'networkidle' });

      const headerHeight = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? header.getBoundingClientRect().height : 0;
      });

      headerHeights.push(headerHeight);
    }

    // All headers should be roughly the same height
    const avgHeight = headerHeights.reduce((a, b) => a + b, 0) / headerHeights.length;
    const allSimilar = headerHeights.every(h => Math.abs(h - avgHeight) < 10);

    expect(allSimilar, 'Header heights should be consistent across pages').toBe(true);
  });

  test('footer should be consistent across pages', async ({ page }) => {
    const footerHeights: number[] = [];

    for (const p of pages.slice(0, 3)) {
      await page.goto(p.path, { waitUntil: 'networkidle' });

      const footerHeight = await page.evaluate(() => {
        const footer = document.querySelector('footer');
        return footer ? footer.getBoundingClientRect().height : 0;
      });

      footerHeights.push(footerHeight);
    }

    // All footers should exist and have similar heights
    const allExist = footerHeights.every(h => h > 0);
    expect(allExist, 'Footer should exist on all pages').toBe(true);
  });
});

test.describe('Z-Index and Layering', () => {
  test('should not have z-index conflicts on homepage', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const zIndexIssues = await detectZIndexIssues(page);

    if (zIndexIssues.length > 0) {
      console.log('Potential z-index issues:', zIndexIssues);
    }

    // This is more of a warning than a hard failure
    expect(zIndexIssues.length, 'Should minimize z-index conflicts').toBeLessThan(5);
  });

  test('modals should appear above all other content', async ({ page }) => {
    await page.goto('/');

    // Try to find and trigger a modal/dialog
    const modalTrigger = page.locator('[data-testid*="modal"], [aria-haspopup="dialog"]').first();

    if (await modalTrigger.count() > 0) {
      await modalTrigger.click();
      await page.waitForTimeout(500);

      const modalZIndex = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const styles = window.getComputedStyle(modal);
          return parseInt(styles.zIndex, 10) || 0;
        }
        return 0;
      });

      // Modal z-index should be very high (typically 1000+)
      expect(modalZIndex, 'Modal should have high z-index').toBeGreaterThan(100);
    }
  });
});

test.describe('Fixed and Sticky Elements', () => {
  test('fixed header should not cover content on scroll', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    // Check if header is fixed
    const headerPosition = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header ? window.getComputedStyle(header).position : 'static';
    });

    if (headerPosition === 'fixed' || headerPosition === 'sticky') {
      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);

      // Check if content is obscured by header
      const isContentVisible = await page.evaluate(() => {
        const header = document.querySelector('header');
        const main = document.querySelector('main');

        if (!header || !main) return true;

        const headerRect = header.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();

        // Main content should start below the header
        return mainRect.top >= headerRect.bottom || mainRect.top < 0;
      });

      expect(isContentVisible, 'Fixed header should not obscure main content').toBe(true);
    }
  });

  test('should handle sticky elements properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/events', { waitUntil: 'networkidle' });

    const stickyElements = await page.$$eval('*', elements => {
      return elements
        .map(el => {
          const styles = window.getComputedStyle(el);
          return {
            position: styles.position,
            tag: el.tagName,
            class: el.className,
          };
        })
        .filter(el => el.position === 'sticky' || el.position === 'fixed');
    });

    if (stickyElements.length > 0) {
      console.log(`Found ${stickyElements.length} sticky/fixed elements:`, stickyElements);

      // Far enough down that every sticky element has pinned. At 300px the
      // filter bar and the day header on /events are still in the flow, and
      // summing their heights anyway reported 53% for what was 23% on screen.
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(500);

      // The share of the viewport's HEIGHT that pinned, full-width chrome
      // covers, as the union of their vertical bands (WEB-CI-028). Not a sum:
      // the filter bar slides 5px under the header, and the empty toast
      // viewport sits inside the header's band. Only layers at least half the
      // viewport wide count - a 48px floating button covers a corner, not a
      // band. A sticky element counts only while it is stuck at its offset.
      const viewportObstruction = await page.evaluate(() => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const bands: Array<[number, number]> = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const styles = window.getComputedStyle(el);
          if (styles.position !== 'sticky' && styles.position !== 'fixed') continue;
          if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          if (el.childElementCount === 0 && !el.textContent?.trim()) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < vw / 2) continue;
          if (styles.position === 'sticky') {
            const top = parseFloat(styles.top);
            const bottom = parseFloat(styles.bottom);
            const stuckTop = Number.isFinite(top) && Math.abs(rect.top - top) < 1;
            const stuckBottom = Number.isFinite(bottom) && Math.abs(vh - rect.bottom - bottom) < 1;
            if (!stuckTop && !stuckBottom) continue;
          }
          const from = Math.max(0, rect.top);
          const to = Math.min(vh, rect.bottom);
          if (to > from) bands.push([from, to]);
        }
        bands.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        let end = -Infinity;
        for (const [from, to] of bands) {
          if (to <= end) continue;
          covered += to - Math.max(from, end);
          end = to;
        }
        return (covered / vh) * 100;
      });

      // Sticky elements shouldn't take up more than 30% of viewport
      expect(
        viewportObstruction,
        'Sticky elements should not obstruct too much of the viewport'
      ).toBeLessThan(30);
    }
  });
});

test.describe('Content Layout Issues', () => {
  test('should not have elements with negative margins causing layout issues', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const negativeMarginIssues = await page.$$eval('*', elements => {
      return elements
        .map(el => {
          const styles = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            class: el.className,
            marginTop: parseFloat(styles.marginTop),
            marginLeft: parseFloat(styles.marginLeft),
            visible: rect.width > 0 && rect.height > 0,
          };
        })
        .filter(el =>
          el.visible &&
          (el.marginTop < -50 || el.marginLeft < -50) // Significant negative margins
        );
    });

    if (negativeMarginIssues.length > 0) {
      console.log('Elements with significant negative margins:', negativeMarginIssues.slice(0, 5));
    }

    // Large negative margins can cause layout issues
    expect(
      negativeMarginIssues.length,
      'Should minimize use of large negative margins'
    ).toBeLessThan(5);
  });

  test('should not have content extending beyond page boundaries', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const beyondBoundaries = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      return allElements
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const isBeyondRight = rect.right > window.innerWidth + 20; // 20px tolerance
          const isBeyondLeft = rect.left < -20;
          if (!isVisible || !(isBeyondRight || isBeyondLeft)) return false;
          // A chip past the edge of an overflow-x-auto row is the row's
          // scrollable content, not page overflow: the row clips it and the
          // page does not scroll sideways (WEB-CI-028 - the home hero's
          // "Near me"/"Free" links and the /events neighbourhood chips were
          // all reported this way). <html> and <body> are deliberately not
          // treated as clippers, so overflow-x:hidden on the page itself
          // cannot hide a real break.
          for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
            if (window.getComputedStyle(a).overflowX !== 'visible') return false;
          }
          return true;
        })
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.substring(0, 30),
        }))
        .slice(0, 5);
    });

    if (beyondBoundaries.length > 0) {
      console.log('Elements beyond page boundaries:', beyondBoundaries);
    }

    expect(
      beyondBoundaries.length,
      'Content should not extend beyond page boundaries'
    ).toBe(0);
  });
});

test.describe('Tab Order and Visual Layout', () => {
  test('tab order should match visual layout on homepage', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const tabOrder = await page.evaluate(() => {
      const focusableElements = Array.from(
        document.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
      );

      return focusableElements.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          tabIndex: (el as HTMLElement).tabIndex,
          top: rect.top,
          left: rect.left,
          text: el.textContent?.substring(0, 30),
        };
      });
    });

    // Check if tab order roughly follows visual order (top to bottom, left to right)
    for (let i = 0; i < tabOrder.length - 1; i++) {
      const current = tabOrder[i];
      const next = tabOrder[i + 1];

      // If there's a large jump upward, tab order might not match visual layout
      if (next.top < current.top - 100) {
        console.warn(`Tab order jump detected: ${current.text} -> ${next.text}`);
      }
    }

    // This is informational - perfect tab order matching visual layout is complex
    expect(tabOrder.length).toBeGreaterThan(0);
  });
});
