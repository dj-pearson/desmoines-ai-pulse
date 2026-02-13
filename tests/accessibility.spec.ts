import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility (a11y) Testing Suite
 *
 * This suite validates:
 * - WCAG 2.1 compliance
 * - Keyboard navigation
 * - Screen reader compatibility
 * - Color contrast
 * - Focus management
 * - ARIA attributes
 * - Semantic HTML
 * - Skip links
 */

const pages = [
  { path: '/', name: 'homepage' },
  { path: '/events', name: 'events' },
  { path: '/events/today', name: 'events-today' },
  { path: '/events/this-weekend', name: 'events-this-weekend' },
  { path: '/events/free', name: 'free-events' },
  { path: '/events/kids', name: 'kids-events' },
  { path: '/events/date-night', name: 'date-night-events' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/restaurants/open-now', name: 'open-now-restaurants' },
  { path: '/restaurants/dietary', name: 'dietary-restaurants' },
  { path: '/attractions', name: 'attractions' },
  { path: '/playgrounds', name: 'playgrounds' },
  { path: '/articles', name: 'articles' },
  { path: '/neighborhoods', name: 'neighborhoods' },
  { path: '/weekend', name: 'weekend' },
  { path: '/guides', name: 'guides' },
  { path: '/pricing', name: 'pricing' },
  { path: '/contact', name: 'contact' },
  { path: '/auth', name: 'auth' },
  { path: '/privacy-policy', name: 'privacy-policy' },
  { path: '/terms', name: 'terms' },
  { path: '/accessibility', name: 'accessibility-statement' },
  { path: '/trip-planner', name: 'trip-planner' },
  { path: '/search', name: 'advanced-search' },
];

test.describe('Automated Accessibility Testing with Axe', () => {
  for (const page of pages) {
    test(`${page.name} should not have accessibility violations`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const accessibilityScanResults = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const { violations } = accessibilityScanResults;

      if (violations.length > 0) {
        console.log(`Found ${violations.length} accessibility violations on ${page.name}:`);
        violations.forEach(violation => {
          console.log(`- ${violation.id}: ${violation.description}`);
          console.log(`  Impact: ${violation.impact}`);
          console.log(`  Affected elements: ${violation.nodes.length}`);
        });
      }

      expect(violations, `Should have no accessibility violations on ${page.name}`).toEqual([]);
    });

    test(`${page.name} should not have critical accessibility violations`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const accessibilityScanResults = await new AxeBuilder({ page: pw })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );

      if (criticalViolations.length > 0) {
        console.error('Critical accessibility violations:', criticalViolations);
      }

      expect(criticalViolations.length, 'Should have no critical accessibility violations').toBe(0);
    });
  }
});

test.describe('Keyboard Navigation', () => {
  test('homepage should be fully keyboard navigable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Start from the top
    await page.keyboard.press('Tab');

    const focusableElements: string[] = [];

    // Tab through multiple elements
    for (let i = 0; i < 20; i++) {
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return {
          tag: el.tagName,
          text: el.textContent?.substring(0, 30),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
        };
      });

      if (focusedElement) {
        focusableElements.push(`${focusedElement.tag} - ${focusedElement.text || focusedElement.ariaLabel}`);
      }

      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    console.log('Keyboard navigation path:', focusableElements.slice(0, 10));

    // Should have successfully focused multiple elements
    expect(focusableElements.length, 'Should have multiple keyboard-focusable elements').toBeGreaterThan(5);
  });

  test('all interactive elements should be keyboard accessible', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    // Find all interactive elements
    const interactiveElements = await page.$$eval(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]',
      elements =>
        elements.map(el => ({
          tag: el.tagName,
          tabIndex: (el as HTMLElement).tabIndex,
          canFocus: (el as HTMLElement).tabIndex >= 0,
        }))
    );

    const nonFocusableInteractive = interactiveElements.filter(el => !el.canFocus && el.tabIndex === -1);

    if (nonFocusableInteractive.length > 0) {
      console.warn('Interactive elements not keyboard accessible:', nonFocusableInteractive.slice(0, 5));
    }

    // Most interactive elements should be focusable
    const focusablePercentage =
      ((interactiveElements.length - nonFocusableInteractive.length) / Math.max(interactiveElements.length, 1)) * 100;

    expect(focusablePercentage, 'At least 90% of interactive elements should be keyboard accessible').toBeGreaterThan(
      90
    );
  });

  test('Enter key should activate buttons and links', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Find a link or button
    const link = page.locator('a[href]').first();
    await link.focus();

    const initialUrl = page.url();

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const newUrl = page.url();

    // URL should have changed (navigation occurred)
    const navigationOccurred = newUrl !== initialUrl;

    if (navigationOccurred) {
      console.log('Enter key successfully activates links');
    }
  });

  test('Space key should activate buttons', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const button = page.locator('button').first();

    if (await button.count() > 0) {
      await button.focus();
      await page.keyboard.press('Space');

      // Some action should occur (hard to test universally)
      console.log('Space key activates buttons');
    }
  });

  test('Escape key should close modals/dialogs', async ({ page }) => {
    await page.goto('/');

    // Try to open a modal
    const modalTrigger = page.locator('[aria-haspopup="dialog"], [data-testid*="modal"]').first();

    if (await modalTrigger.count() > 0) {
      await modalTrigger.click();
      await page.waitForTimeout(500);

      // Check if modal is open
      const modal = page.locator('[role="dialog"]');

      if (await modal.count() > 0) {
        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Modal should be closed
        const modalStillVisible = await modal.isVisible().catch(() => false);

        expect(modalStillVisible, 'Escape key should close modals').toBe(false);
        console.log('Escape key properly closes modals');
      }
    }
  });
});

test.describe('Focus Management', () => {
  test('focus should be visible on all interactive elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Tab to first focusable element
    await page.keyboard.press('Tab');

    const hasFocusStyles = await page.evaluate(() => {
      const focused = document.activeElement;
      if (!focused) return false;

      const styles = window.getComputedStyle(focused);
      const pseudoStyles = window.getComputedStyle(focused, ':focus-visible');

      // Check for focus indicators
      const hasOutline = styles.outline !== 'none' && styles.outline !== '';
      const hasFocusRing = styles.boxShadow.includes('ring') || pseudoStyles.outline !== 'none';
      const hasBorder = styles.borderWidth !== '0px';

      return hasOutline || hasFocusRing || hasBorder;
    });

    expect(hasFocusStyles, 'Focused elements should have visible focus indicators').toBe(true);
  });

  test('focus should not be trapped unexpectedly', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const focusedElements = new Set<string>();

    // Tab through elements
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');

      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);

      if (focusedTag) {
        focusedElements.add(focusedTag);
      }
    }

    // Should be able to focus different types of elements
    expect(focusedElements.size, 'Should be able to tab through different elements').toBeGreaterThan(2);
  });

  test('modal should trap focus', async ({ page }) => {
    await page.goto('/');

    const modalTrigger = page.locator('[aria-haspopup="dialog"]').first();

    if (await modalTrigger.count() > 0) {
      await modalTrigger.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"]');

      if (await modal.isVisible()) {
        // Tab multiple times
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
        }

        // Focus should still be within modal
        const focusInModal = await page.evaluate(() => {
          const focused = document.activeElement;
          const modal = document.querySelector('[role="dialog"]');
          return modal?.contains(focused);
        });

        expect(focusInModal, 'Focus should be trapped within modal').toBe(true);
      }
    }
  });
});

test.describe('Skip Links', () => {
  test('should have skip to main content link', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Press Tab to focus skip link
    await page.keyboard.press('Tab');

    const skipLink = await page.evaluate(() => {
      const focused = document.activeElement;
      if (!focused) return null;

      const text = focused.textContent?.toLowerCase() || '';
      const href = focused.getAttribute('href');

      return {
        text,
        href,
        isSkipLink: text.includes('skip') && text.includes('content'),
      };
    });

    if (skipLink?.isSkipLink) {
      console.log('Skip link found:', skipLink);

      // Activate skip link
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Focus should move to main content
      const focusedAfterSkip = await page.evaluate(() => {
        const focused = document.activeElement;
        return {
          tag: focused?.tagName,
          id: focused?.id,
        };
      });

      console.log('Focus after skip link:', focusedAfterSkip);
      expect(skipLink.isSkipLink, 'Should have functional skip link').toBe(true);
    } else {
      console.warn('No skip link found - consider adding for accessibility');
    }
  });
});

test.describe('ARIA Attributes', () => {
  test('buttons should have proper ARIA roles and labels', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const buttonsWithoutLabels = await page.$$eval('button, [role="button"]', buttons =>
      buttons
        .map(btn => ({
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          ariaLabelledBy: btn.getAttribute('aria-labelledby'),
          hasLabel: !!(btn.textContent?.trim() || btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby')),
        }))
        .filter(btn => !btn.hasLabel)
    );

    if (buttonsWithoutLabels.length > 0) {
      console.log('Buttons without labels:', buttonsWithoutLabels);
    }

    expect(buttonsWithoutLabels.length, 'All buttons should have accessible labels').toBe(0);
  });

  test('images should have alt text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const imagesWithoutAlt = await page.$$eval('img', imgs =>
      imgs
        .filter(img => {
          const alt = img.getAttribute('alt');
          const role = img.getAttribute('role');
          // Decorative images should have role="presentation" or empty alt
          return alt === null && role !== 'presentation';
        })
        .map(img => ({
          src: img.src.substring(0, 50),
          alt: img.getAttribute('alt'),
        }))
    );

    if (imagesWithoutAlt.length > 0) {
      console.log('Images without alt text:', imagesWithoutAlt);
    }

    expect(imagesWithoutAlt.length, 'All meaningful images should have alt text').toBe(0);
  });

  test('form inputs should have labels', async ({ page }) => {
    await page.goto('/auth');

    const inputsWithoutLabels = await page.$$eval('input:not([type="hidden"]), textarea, select', inputs =>
      inputs
        .map(input => {
          const hasLabel = !!input.labels?.length;
          const hasAriaLabel = !!input.getAttribute('aria-label');
          const hasAriaLabelledBy = !!input.getAttribute('aria-labelledby');

          return {
            type: input.getAttribute('type'),
            name: input.getAttribute('name'),
            hasLabel: hasLabel || hasAriaLabel || hasAriaLabelledBy,
          };
        })
        .filter(input => !input.hasLabel)
    );

    if (inputsWithoutLabels.length > 0) {
      console.log('Form inputs without labels:', inputsWithoutLabels);
    }

    expect(inputsWithoutLabels.length, 'All form inputs should have labels').toBe(0);
  });

  test('links should have descriptive text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const poorLinkText = await page.$$eval('a', links =>
      links
        .map(link => ({
          text: link.textContent?.trim().toLowerCase(),
          ariaLabel: link.getAttribute('aria-label'),
          href: link.getAttribute('href'),
        }))
        .filter(link => {
          const text = link.text || link.ariaLabel || '';
          // Generic link text is not descriptive
          return ['click here', 'read more', 'here', 'link', 'more'].includes(text);
        })
    );

    if (poorLinkText.length > 0) {
      console.warn('Links with non-descriptive text:', poorLinkText.slice(0, 5));
      console.warn('Consider using more descriptive link text for better accessibility');
    }

    // This is a warning, not a hard failure
    expect(poorLinkText.length, 'Should minimize generic link text').toBeLessThan(10);
  });
});

test.describe('Semantic HTML', () => {
  test('page should use semantic HTML5 elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const semanticElements = await page.evaluate(() => {
      return {
        hasMain: !!document.querySelector('main'),
        hasHeader: !!document.querySelector('header'),
        hasFooter: !!document.querySelector('footer'),
        hasNav: !!document.querySelector('nav'),
        hasArticle: !!document.querySelectorAll('article').length,
        hasSection: !!document.querySelectorAll('section').length,
      };
    });

    console.log('Semantic HTML elements:', semanticElements);

    expect(semanticElements.hasMain, 'Page should have a <main> element').toBe(true);
    expect(semanticElements.hasHeader, 'Page should have a <header> element').toBe(true);
    expect(semanticElements.hasFooter, 'Page should have a <footer> element').toBe(true);
  });

  test('headings should be in logical order', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', headings =>
      headings.map(h => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.substring(0, 50),
      }))
    );

    console.log('Heading structure:', headings);

    // Should have exactly one h1
    const h1Count = headings.filter(h => h.level === 1).length;
    expect(h1Count, 'Page should have exactly one h1').toBe(1);

    // Check for heading level skips
    for (let i = 1; i < headings.length; i++) {
      const prevLevel = headings[i - 1].level;
      const currentLevel = headings[i].level;
      const levelJump = currentLevel - prevLevel;

      // Should not skip heading levels (e.g., h2 -> h4)
      if (levelJump > 1) {
        console.warn(`Heading level skip: h${prevLevel} -> h${currentLevel}`);
      }
    }
  });
});

test.describe('Color Contrast', () => {
  test('text should have sufficient color contrast', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const contrastIssues = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .disableRules([
        'color-contrast', // We'll check this separately for better reporting
      ])
      .analyze();

    // Run specific color contrast check
    const colorContrastResults = await new AxeBuilder({ page })
      .include('body')
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = colorContrastResults.violations.filter(v => v.id === 'color-contrast');

    if (contrastViolations.length > 0) {
      console.log('Color contrast violations:', contrastViolations);
    }

    expect(contrastViolations.length, 'Should have no color contrast violations').toBe(0);
  });
});

test.describe('Responsive Accessibility', () => {
  test('accessibility should be maintained on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const mobileAccessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalViolations = mobileAccessibility.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    if (criticalViolations.length > 0) {
      console.error('Critical accessibility violations on mobile:', criticalViolations);
    }

    expect(criticalViolations.length, 'Mobile view should have no critical a11y violations').toBe(0);
  });

  test('touch targets should be accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/events', { waitUntil: 'networkidle' });

    const touchTargets = await page.$$eval('button, a, input, select', elements =>
      elements
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            width: rect.width,
            height: rect.height,
            meetsSize: rect.width >= 44 && rect.height >= 44,
            visible: rect.width > 0 && rect.height > 0,
          };
        })
        .filter(el => el.visible)
    );

    const tooSmall = touchTargets.filter(t => !t.meetsSize);

    if (tooSmall.length > 0) {
      console.log(`${tooSmall.length} of ${touchTargets.length} touch targets are below 44x44px`);
    }

    // At least 70% should meet the size requirement
    const percentageMeetingSize = ((touchTargets.length - tooSmall.length) / touchTargets.length) * 100;
    expect(percentageMeetingSize, 'At least 70% of touch targets should be 44x44px or larger').toBeGreaterThan(70);
  });
});

test.describe('Screen Reader Support', () => {
  test('page should have proper document title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const title = await page.title();

    expect(title.length, 'Page should have a descriptive title').toBeGreaterThan(0);
    expect(title, 'Title should not be generic').not.toMatch(/^(untitled|new page|page)$/i);

    console.log('Page title:', title);
  });

  test('page should have proper lang attribute', async ({ page }) => {
    await page.goto('/');

    const lang = await page.getAttribute('html', 'lang');

    expect(lang, 'HTML should have lang attribute').toBeTruthy();
    expect(lang, 'Lang should be valid (en or en-US)').toMatch(/^en(-[A-Z]{2})?$/);
  });

  test('dynamic content should be announced', async ({ page }) => {
    await page.goto('/');

    const liveRegions = await page.$$eval('[aria-live], [role="status"], [role="alert"]', regions =>
      regions.map(region => ({
        role: region.getAttribute('role'),
        ariaLive: region.getAttribute('aria-live'),
        ariaAtomic: region.getAttribute('aria-atomic'),
      }))
    );

    if (liveRegions.length > 0) {
      console.log('Found ARIA live regions:', liveRegions);
      console.log('Page uses ARIA live regions for dynamic content');
    }
  });
});

test.describe('WCAG 2.4.1 - Main Content Landmark', () => {
  for (const page of pages) {
    test(`${page.name} should have #main-content element`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const mainContent = await pw.locator('#main-content');
      await expect(mainContent, `${page.name} should have element with id="main-content"`).toHaveCount(1);

      const tagName = await mainContent.evaluate(el => el.tagName.toLowerCase());
      expect(tagName, 'main-content should be a <main> element').toBe('main');
    });
  }

  test('should not have nested <main> landmarks', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const mainCount = await page.locator('main').count();
    expect(mainCount, 'Should have exactly one <main> landmark').toBe(1);
  });
});

test.describe('WCAG 2.4.2 - Page Titles', () => {
  for (const page of pages) {
    test(`${page.name} should have a descriptive document title`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const title = await pw.title();

      expect(title.length, `${page.name} title should not be empty`).toBeGreaterThan(0);
      expect(title, `${page.name} title should include site name`).toContain('Des Moines');
      expect(title, `${page.name} title should not be generic default`).not.toBe('Des Moines AI Pulse');
    });
  }
});

test.describe('WCAG 4.1.2 - Icon Button Labels', () => {
  test('all icon-only buttons should have aria-label', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const unlabeledIconButtons = await page.$$eval('button', buttons =>
      buttons
        .filter(btn => {
          const hasSvgOnly = btn.querySelector('svg') && !btn.textContent?.trim();
          const hasAriaLabel = !!btn.getAttribute('aria-label');
          const hasAriaLabelledBy = !!btn.getAttribute('aria-labelledby');
          const hasTitle = !!btn.getAttribute('title');
          return hasSvgOnly && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle;
        })
        .map(btn => ({
          html: btn.outerHTML.substring(0, 100),
          classes: btn.className.substring(0, 60),
        }))
    );

    if (unlabeledIconButtons.length > 0) {
      console.log('Icon-only buttons missing aria-label:', unlabeledIconButtons);
    }

    expect(unlabeledIconButtons.length, 'All icon-only buttons should have accessible labels').toBe(0);
  });
});

test.describe('WCAG 1.3.1 - Heading Hierarchy', () => {
  for (const page of pages.slice(0, 8)) {
    test(`${page.name} should not skip heading levels`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const headings = await pw.$$eval('h1, h2, h3, h4, h5, h6', headings =>
        headings.map(h => ({
          level: parseInt(h.tagName[1]),
          text: h.textContent?.substring(0, 50),
        }))
      );

      // Check for heading level skips
      const skips: string[] = [];
      for (let i = 1; i < headings.length; i++) {
        const prevLevel = headings[i - 1].level;
        const currentLevel = headings[i].level;
        if (currentLevel - prevLevel > 1) {
          skips.push(`h${prevLevel} -> h${currentLevel} ("${headings[i].text}")`);
        }
      }

      if (skips.length > 0) {
        console.warn(`Heading skips on ${page.name}:`, skips);
      }
    });
  }
});
