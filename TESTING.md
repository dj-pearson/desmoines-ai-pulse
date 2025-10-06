# Testing Documentation - Des Moines Insider

## Overview

This project uses **Playwright** for end-to-end testing with a comprehensive test suite focused on:
- Mobile-first responsive design
- Link and button functionality
- Visual regression and layout
- Performance and Core Web Vitals
- Form validation and UX
- Search and filter behavior
- Accessibility (WCAG 2.1 AA compliance)

## Table of Contents

- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Test Suites](#test-suites)
- [CI/CD Integration](#cicd-integration)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn

### Installation

Playwright and all test dependencies are already installed. If you need to reinstall:

```bash
npm install
npx playwright install
```

## Running Tests

### All Tests

Run all test suites across all configured browsers and devices:

```bash
npm test
```

### Interactive UI Mode

Run tests with Playwright's interactive UI (recommended for development):

```bash
npm run test:ui
```

### Headed Mode

Run tests with visible browser windows:

```bash
npm run test:headed
```

### Mobile-Specific Tests

Test only mobile devices (iPhone, Pixel, tablets):

```bash
npm run test:mobile
```

### Desktop-Specific Tests

Test only desktop browsers:

```bash
npm run test:desktop
```

### Individual Test Suites

Run specific test suites:

```bash
# Link and button functionality
npm run test:links

# Mobile responsive layout
npm run test:mobile-responsive

# Visual regression and overlapping elements
npm run test:visual

# Performance and Core Web Vitals
npm run test:performance

# Form validation and UX
npm run test:forms

# Search and filter functionality
npm run test:search

# Accessibility (WCAG compliance)
npm run test:a11y
```

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:report
```

### Code Generation

Generate test code by interacting with the app:

```bash
npm run test:codegen
```

## Test Suites

### 1. Links and Buttons (`links-and-buttons.spec.ts`)

**What it tests:**
- All internal links are not broken (404s)
- External links have proper security attributes (`rel="noopener"`)
- Buttons are clickable and provide visual feedback
- Touch targets meet minimum size requirements (44x44px)
- All buttons have descriptive text or aria-labels
- Navigation between pages works correctly

**Key Features:**
- Tests all major pages
- Validates cursor pointer styles
- Checks for proper loading states
- Ensures buttons trigger actions

**Run:**
```bash
npm run test:links
```

### 2. Mobile Responsive Layout (`mobile-responsive.spec.ts`)

**What it tests:**
- No horizontal scrolling on any mobile device
- Content fits within viewport
- Text is readable without zooming (min 12px)
- Adequate line height for readability
- Responsive breakpoints adapt layout
- Touch targets have proper spacing (8px minimum)
- Images are responsive and fit viewport
- Proper viewport meta tag

**Devices Tested:**
- iPhone SE (375x667)
- iPhone 12 (390x844)
- Pixel 5 (393x851)
- Samsung Galaxy S21 (360x800)
- Small Mobile (320x568)
- iPad (768x1024)
- iPad Pro (1024x1366)

**Run:**
```bash
npm run test:mobile-responsive
```

### 3. Visual Regression (`visual-regression.spec.ts`)

**What it tests:**
- No overlapping text on any viewport
- Screenshot comparison for visual regressions
- Consistent header/footer across pages
- Z-index conflicts
- Fixed/sticky elements don't obscure content
- No elements with negative margins causing issues
- Tab order matches visual layout

**Key Features:**
- Detects overlapping text elements
- Captures full-page screenshots for comparison
- Validates modal and dialog positioning
- Checks for content extending beyond boundaries

**Run:**
```bash
npm run test:visual
```

### 4. Performance (`performance.spec.ts`)

**What it tests:**
- Page load times (DOM and full load)
- Core Web Vitals:
  - **LCP** (Largest Contentful Paint): < 2.5s good, < 4s acceptable
  - **FCP** (First Contentful Paint): < 1.8s good, < 3s acceptable
  - **CLS** (Cumulative Layout Shift): < 0.1 good, < 0.25 acceptable
- Resource loading efficiency
- Image optimization (size and formats)
- JavaScript performance (long tasks)
- Browser caching headers
- Lazy loading implementation
- Memory leak detection

**Performance Targets:**
- Mobile DOM load: < 3s
- Mobile full load: < 5s
- Desktop DOM load: < 2s
- Desktop full load: < 4s
- Total page size: < 5MB
- Individual images: < 500KB on mobile

**Run:**
```bash
npm run test:performance
```

### 5. Forms (`forms.spec.ts`)

**What it tests:**
- Required field validation
- Email format validation
- Password requirements
- Form labels and accessibility
- Error messages are descriptive and announced
- Autocomplete attributes
- Form submission states (loading, disabled)
- Double submission prevention
- Password visibility toggles
- Mobile-friendly input sizing
- Form reset functionality

**Forms Tested:**
- Authentication (login/signup)
- Business partnership application
- Contact/advertise forms
- Profile update forms

**Run:**
```bash
npm run test:forms
```

### 6. Search and Filters (`search-filters.spec.ts`)

**What it tests:**
- **Search debouncing**: Waits for user to finish typing (not filtering on every keystroke)
- Search results are relevant
- "No results" message displays correctly
- Clearing search restores all results
- Filters work correctly (category, location, etc.)
- Multiple filters can be combined
- Filter reset/clear functionality
- Search query reflected in URL (bookmarkable)
- URL parameters populate search on page load
- Loading indicators during search
- ARIA attributes for screen readers
- Mobile-friendly search and filter controls

**Pages with Search:**
- Events
- Restaurants
- Attractions
- Articles
- Advanced search page

**Key UX Requirements:**
- Search must be debounced (500-800ms delay)
- No layout shift during search
- Touch-friendly filter controls on mobile
- Accessible to keyboard and screen reader users

**Run:**
```bash
npm run test:search
```

### 7. Accessibility (`accessibility.spec.ts`)

**What it tests:**
- **WCAG 2.1 Level AA compliance** using axe-core
- Keyboard navigation (Tab, Enter, Space, Escape)
- Focus visibility on all interactive elements
- Focus management (no traps, modal focus trapping)
- Skip to main content link
- ARIA attributes (labels, roles, live regions)
- Alt text for images
- Form labels
- Descriptive link text
- Semantic HTML5 (main, header, footer, nav)
- Logical heading structure (h1-h6)
- Color contrast ratios
- Touch targets on mobile (44x44px)
- Screen reader support (lang attribute, page titles)

**Standards:**
- WCAG 2.1 Level AA
- No critical or serious violations
- All interactive elements keyboard accessible
- Minimum color contrast ratio 4.5:1 for text

**Run:**
```bash
npm run test:a11y
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/playwright.yml`:

```yaml
name: Playwright Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npm test

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### Environment Variables

For CI/CD, set the base URL:

```bash
PLAYWRIGHT_TEST_BASE_URL=https://your-staging-site.com
```

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something specific', async ({ page }) => {
    // Navigate
    await page.goto('/path');

    // Interact
    await page.click('button');

    // Assert
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### Best Practices

1. **Use descriptive test names** - Test names should clearly describe what is being tested
2. **Test user flows, not implementation** - Focus on what users do, not how the code works
3. **Use data-testid for stable selectors** - Avoid CSS classes that might change
4. **Wait for elements properly** - Use `waitForSelector`, `waitForLoadState`
5. **Test mobile-first** - Always include mobile viewport tests
6. **Keep tests independent** - Each test should be able to run in isolation
7. **Use Page Object Model** - For complex pages, create page objects

### Example: Testing a New Feature

```typescript
test('should filter events by category', async ({ page }) => {
  // Arrange
  await page.goto('/events');
  await page.waitForLoadState('networkidle');

  // Act
  await page.selectOption('select[name="category"]', 'music');
  await page.waitForTimeout(800); // Wait for debounce

  // Assert
  const events = await page.locator('.event-card').all();
  expect(events.length).toBeGreaterThan(0);

  // Verify all results match filter
  for (const event of events) {
    const category = await event.getAttribute('data-category');
    expect(category).toBe('music');
  }
});
```

## Troubleshooting

### Tests Timing Out

- Increase timeout in test: `test.setTimeout(60000)`
- Check if dev server is running: `npm run dev`
- Verify network requests aren't hanging

### Flaky Tests

- Add proper waits: `await page.waitForLoadState('networkidle')`
- Use `expect.toPass()` for retryable assertions
- Check for race conditions

### Screenshot Differences

- Update baseline screenshots: `npm test -- --update-snapshots`
- Check if there are intentional changes
- Consider platform differences (fonts, rendering)

### Can't Find Elements

- Use Playwright Inspector: `npm run test:headed`
- Verify element is visible and not covered
- Check timing - element might not be loaded yet

### Performance Tests Failing

- Check network conditions
- Verify server performance
- Consider caching effects
- Run tests multiple times to get average

### Accessibility Violations

- Use browser DevTools Accessibility panel
- Install axe DevTools browser extension
- Check ARIA attributes and roles
- Verify keyboard navigation manually

## Test Coverage Goals

- **Links/Buttons**: 100% of interactive elements tested
- **Mobile Responsive**: All pages on 5+ devices
- **Visual Regression**: Key pages with screenshot comparison
- **Performance**: All pages meet Core Web Vitals targets
- **Forms**: All forms with complete validation
- **Search**: All search/filter pages with debouncing
- **Accessibility**: Zero critical violations (WCAG 2.1 AA)

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Mobile Touch Target Size](https://web.dev/tap-targets/)

## Support

For questions or issues with tests:
1. Check test output and error messages
2. Run tests in UI mode for debugging
3. Review this documentation
4. Check Playwright documentation
5. Create an issue with test name and error details
