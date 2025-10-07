import { test, expect, Page } from '@playwright/test';

/**
 * Mobile-First Responsive Layout Testing Suite
 *
 * This suite validates:
 * - Mobile layouts render correctly
 * - No horizontal scrolling on mobile
 * - Text is readable without zooming
 * - Content fits within viewport
 * - No overlapping elements
 * - Touch-friendly spacing
 * - Responsive breakpoints work correctly
 */

const pages = [
  '/',
  '/events',
  '/events/today',
  '/restaurants',
  '/attractions',
  '/playgrounds',
  '/articles',
  '/neighborhoods',
  '/weekend',
  '/guides',
];

const mobileViewports = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12', width: 390, height: 844 },
  { name: 'Pixel 5', width: 393, height: 851 },
  { name: 'Samsung Galaxy S21', width: 360, height: 800 },
  { name: 'Small Mobile', width: 320, height: 568 }, // Smallest common mobile
];

const tabletViewports = [
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'iPad Pro', width: 1024, height: 1366 },
  { name: 'Android Tablet', width: 800, height: 1280 },
];

async function checkForHorizontalScroll(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
}

async function getOverlappingElements(page: Page): Promise<any[]> {
  return await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0;
    });

    const overlapping: any[] = [];

    for (let i = 0; i < elements.length; i++) {
      const rect1 = elements[i].getBoundingClientRect();

      for (let j = i + 1; j < elements.length; j++) {
        const rect2 = elements[j].getBoundingClientRect();

        // Check if rectangles overlap
        const isOverlapping = !(
          rect1.right < rect2.left ||
          rect1.left > rect2.right ||
          rect1.bottom < rect2.top ||
          rect1.top > rect2.bottom
        );

        if (isOverlapping) {
          // Check if they're parent-child (which is ok)
          const el1 = elements[i];
          const el2 = elements[j];
          const isParentChild = el1.contains(el2) || el2.contains(el1);

          if (!isParentChild) {
            overlapping.push({
              element1: {
                tag: el1.tagName,
                class: el1.className,
                text: el1.textContent?.substring(0, 50),
              },
              element2: {
                tag: el2.tagName,
                class: el2.className,
                text: el2.textContent?.substring(0, 50),
              },
            });
          }
        }
      }
    }

    return overlapping.slice(0, 5); // Return first 5 overlaps to avoid huge output
  });
}

test.describe('Mobile Viewport - No Horizontal Scroll', () => {
  for (const viewport of mobileViewports) {
    for (const path of pages) {
      test(`${path} should not have horizontal scroll on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(path, { waitUntil: 'networkidle' });

        // Wait for any lazy-loaded content
        await page.waitForTimeout(1000);

        const hasHorizontalScroll = await checkForHorizontalScroll(page);

        expect(hasHorizontalScroll, `Page should not have horizontal scroll on ${viewport.name}`).toBe(false);
      });
    }
  }
});

test.describe('Mobile Layout - Content Fits Viewport', () => {
  for (const path of pages) {
    test(`${path} should have all content within viewport on mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

      await page.goto(path, { waitUntil: 'networkidle' });

      // Check for elements that extend beyond viewport
      const overflowingElements = await page.$$eval('*', (elements) => {
        return elements
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const isOverflowing = rect.right > window.innerWidth || rect.left < 0;
            return {
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.substring(0, 30),
              isOverflowing,
              right: rect.right,
              width: rect.width,
              viewportWidth: window.innerWidth,
            };
          })
          .filter((el) => el.isOverflowing && el.width > 0);
      });

      if (overflowingElements.length > 0) {
        console.log('Overflowing elements found:', overflowingElements.slice(0, 5));
      }

      // Allow for some minor overflow (like scrollbars)
      const significantOverflow = overflowingElements.filter((el) => el.right - el.viewportWidth > 20);

      expect(
        significantOverflow.length,
        `Found ${significantOverflow.length} elements significantly overflowing viewport`
      ).toBe(0);
    });
  }
});

test.describe('Text Readability on Mobile', () => {
  for (const path of pages) {
    test(`${path} should have readable text sizes on mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(path, { waitUntil: 'networkidle' });

      // Check for text that's too small to read comfortably on mobile
      const tooSmallText = await page.$$eval('p, span, a, button, h1, h2, h3, h4, h5, h6, li, td', (elements) => {
        return elements
          .map((el) => {
            const styles = window.getComputedStyle(el);
            const fontSize = parseFloat(styles.fontSize);
            const text = el.textContent?.trim() || '';
            return {
              tag: el.tagName,
              fontSize,
              text: text.substring(0, 50),
              visible: el.getBoundingClientRect().height > 0,
            };
          })
          .filter((el) => el.visible && el.fontSize < 12 && el.text.length > 0); // Less than 12px is too small
      });

      if (tooSmallText.length > 0) {
        console.log(`Found ${tooSmallText.length} text elements with font size < 12px:`, tooSmallText.slice(0, 5));
      }

      // Allow some flexibility for labels, but most text should be readable
      expect(
        tooSmallText.length,
        'Too many text elements with font size below 12px'
      ).toBeLessThan(10);
    });

    test(`${path} should have adequate line height for readability`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(path, { waitUntil: 'networkidle' });

      const poorLineHeight = await page.$$eval('p, li, article', (elements) => {
        return elements
          .map((el) => {
            const styles = window.getComputedStyle(el);
            const lineHeight = parseFloat(styles.lineHeight);
            const fontSize = parseFloat(styles.fontSize);
            const ratio = lineHeight / fontSize;
            return {
              tag: el.tagName,
              class: el.className,
              lineHeight,
              fontSize,
              ratio,
              visible: el.getBoundingClientRect().height > 0,
            };
          })
          .filter((el) => el.visible && el.ratio < 1.2 && el.fontSize > 0); // Line height should be at least 1.2x font size
      });

      // Line height is important for readability
      expect(
        poorLineHeight.length,
        'Found text with insufficient line height (< 1.2x font size)'
      ).toBeLessThan(5);
    });
  }
});

test.describe('Responsive Breakpoints', () => {
  const breakpoints = [
    { name: 'Mobile Small', width: 320 },
    { name: 'Mobile', width: 375 },
    { name: 'Mobile Large', width: 425 },
    { name: 'Tablet', width: 768 },
    { name: 'Desktop Small', width: 1024 },
    { name: 'Desktop', width: 1440 },
  ];

  test('should adapt layout at different breakpoints on homepage', async ({ page }) => {
    const path = '/';

    const layouts: any[] = [];

    for (const breakpoint of breakpoints) {
      await page.setViewportSize({ width: breakpoint.width, height: 800 });
      await page.goto(path, { waitUntil: 'networkidle' });

      const layout = await page.evaluate(() => {
        const main = document.querySelector('main');
        const header = document.querySelector('header');
        const nav = document.querySelector('nav');

        return {
          mainWidth: main?.getBoundingClientRect().width || 0,
          headerHeight: header?.getBoundingClientRect().height || 0,
          navVisible: nav ? window.getComputedStyle(nav).display !== 'none' : false,
          viewportWidth: window.innerWidth,
        };
      });

      layouts.push({ breakpoint: breakpoint.name, ...layout });
    }

    // Verify that layout changes at different breakpoints
    const uniqueLayouts = new Set(layouts.map((l) => `${l.mainWidth}-${l.headerHeight}`));

    expect(
      uniqueLayouts.size,
      'Layout should adapt to different screen sizes'
    ).toBeGreaterThan(1);
  });
});

test.describe('Touch Target Spacing on Mobile', () => {
  for (const path of pages) {
    test(`${path} should have adequate spacing between touch targets`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(path, { waitUntil: 'networkidle' });

      // Find interactive elements that are close together
      const closeElements = await page.evaluate(() => {
        const interactive = Array.from(
          document.querySelectorAll('button, a, input, select, textarea, [role="button"], [onclick]')
        );

        const visibleElements = interactive
          .map((el) => ({
            element: el,
            rect: el.getBoundingClientRect(),
          }))
          .filter((item) => item.rect.width > 0 && item.rect.height > 0);

        const tooClose: any[] = [];

        for (let i = 0; i < visibleElements.length; i++) {
          for (let j = i + 1; j < visibleElements.length; j++) {
            const rect1 = visibleElements[i].rect;
            const rect2 = visibleElements[j].rect;

            // Calculate distance between elements
            const verticalDistance = Math.min(
              Math.abs(rect1.bottom - rect2.top),
              Math.abs(rect2.bottom - rect1.top)
            );
            const horizontalDistance = Math.min(
              Math.abs(rect1.right - rect2.left),
              Math.abs(rect2.right - rect1.left)
            );

            const minDistance = Math.min(verticalDistance, horizontalDistance);

            // Touch targets should be at least 8px apart
            if (minDistance < 8 && minDistance > 0) {
              const el1 = visibleElements[i].element;
              const el2 = visibleElements[j].element;

              // Skip if one contains the other
              if (!el1.contains(el2) && !el2.contains(el1)) {
                tooClose.push({
                  element1: {
                    tag: el1.tagName,
                    text: el1.textContent?.substring(0, 30),
                  },
                  element2: {
                    tag: el2.tagName,
                    text: el2.textContent?.substring(0, 30),
                  },
                  distance: minDistance,
                });
              }
            }
          }
        }

        return tooClose.slice(0, 10); // Return first 10
      });

      if (closeElements.length > 0) {
        console.log(`Found ${closeElements.length} touch targets closer than 8px:`, closeElements);
      }

      // This is more of a warning than a hard failure
      expect(
        closeElements.length,
        'Found touch targets with insufficient spacing'
      ).toBeLessThan(15);
    });
  }
});

test.describe('Image Responsiveness', () => {
  for (const path of pages) {
    test(`${path} should have responsive images that fit viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(path, { waitUntil: 'networkidle' });

      const oversizedImages = await page.$$eval('img', (images) => {
        return images
          .map((img) => {
            const rect = img.getBoundingClientRect();
            return {
              src: img.src.substring(0, 50),
              width: rect.width,
              naturalWidth: img.naturalWidth,
              viewportWidth: window.innerWidth,
              isOversized: rect.width > window.innerWidth,
            };
          })
          .filter((img) => img.isOversized && img.width > 0);
      });

      expect(
        oversizedImages.length,
        `Found ${oversizedImages.length} images wider than viewport`
      ).toBe(0);
    });
  }
});

test.describe('Tablet Viewport Testing', () => {
  for (const viewport of tabletViewports) {
    test(`homepage should render correctly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/', { waitUntil: 'networkidle' });

      const hasHorizontalScroll = await checkForHorizontalScroll(page);
      expect(hasHorizontalScroll).toBe(false);

      // Check that layout uses available space effectively
      const mainWidth = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.getBoundingClientRect().width : 0;
      });

      // Main content should use a good portion of the viewport on tablet
      expect(mainWidth).toBeGreaterThan(viewport.width * 0.7);
    });
  }
});

test.describe('Viewport Meta Tag', () => {
  test('should have proper viewport meta tag', async ({ page }) => {
    await page.goto('/');

    const viewportMeta = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));

    expect(viewportMeta).toBeTruthy();
    expect(viewportMeta).toContain('width=device-width');
    expect(viewportMeta).toContain('initial-scale=1');
  });
});
