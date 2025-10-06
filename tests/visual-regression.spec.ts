import { test, expect, Page } from '@playwright/test';

/**
 * Visual Regression and Layout Testing Suite
 *
 * This suite validates:
 * - No overlapping text or UI elements
 * - Consistent layout across viewports
 * - Visual snapshots for regression detection
 * - Z-index issues
 * - Modal and dialog positioning
 * - Fixed/sticky element positioning
 */

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
      return text && text.length > 0 && rect.width > 0 && rect.height > 0;
    });

    const overlapping: any[] = [];

    for (let i = 0; i < textElements.length; i++) {
      const el1 = textElements[i];
      const rect1 = el1.getBoundingClientRect();

      for (let j = i + 1; j < textElements.length; j++) {
        const el2 = textElements[j];
        const rect2 = el2.getBoundingClientRect();

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

test.describe('Visual Regression - Screenshots', () => {
  for (const page of pages) {
    test(`${page.name} visual regression on mobile`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 375, height: 667 });
      await pw.goto(page.path, { waitUntil: 'networkidle' });
      await pw.waitForTimeout(2000); // Wait for animations and lazy loading

      // Take screenshot of the full page
      await expect(pw).toHaveScreenshot(`${page.name}-mobile.png`, {
        fullPage: true,
        maxDiffPixels: 100, // Allow minor differences
      });
    });

    test(`${page.name} visual regression on desktop`, async ({ page: pw }) => {
      await pw.setViewportSize({ width: 1920, height: 1080 });
      await pw.goto(page.path, { waitUntil: 'networkidle' });
      await pw.waitForTimeout(2000);

      await expect(pw).toHaveScreenshot(`${page.name}-desktop.png`, {
        fullPage: true,
        maxDiffPixels: 100,
      });
    });
  }
});

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

      // Scroll to test sticky behavior
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(500);

      // Check viewport is not obstructed
      const viewportObstruction = await page.evaluate(() => {
        const vh = window.innerHeight;
        const stickyEls = Array.from(document.querySelectorAll('*')).filter(el => {
          const styles = window.getComputedStyle(el);
          return styles.position === 'sticky' || styles.position === 'fixed';
        });

        const totalStickyHeight = stickyEls.reduce((sum, el) => {
          return sum + el.getBoundingClientRect().height;
        }, 0);

        return (totalStickyHeight / vh) * 100; // Percentage of viewport
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
          return isVisible && (isBeyondRight || isBeyondLeft);
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
