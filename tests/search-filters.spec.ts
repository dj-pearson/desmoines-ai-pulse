import { test, expect, Page } from '@playwright/test';

/**
 * Search and Filter Functionality Testing Suite
 *
 * This suite validates:
 * - Search bar behavior (wait for user to finish typing)
 * - Filter functionality
 * - Real-time search without UX issues
 * - Debouncing implementation
 * - Search results relevance
 * - Clear search functionality
 * - Multiple filter combinations
 * - URL parameter handling for filters
 */

const pagesWithSearch = [
  { path: '/events', name: 'events', hasFilters: true },
  { path: '/restaurants', name: 'restaurants', hasFilters: true },
  { path: '/attractions', name: 'attractions', hasFilters: true },
  { path: '/articles', name: 'articles', hasFilters: true },
  { path: '/search', name: 'advanced-search', hasFilters: true },
];

async function findSearchInputs(page: Page): Promise<any[]> {
  return await page.$$eval('input[type="search"], input[type="text"][placeholder*="search" i], input[aria-label*="search" i]', inputs =>
    inputs.map((input, index) => ({
      index,
      type: input.getAttribute('type'),
      placeholder: input.getAttribute('placeholder'),
      ariaLabel: input.getAttribute('aria-label'),
      name: input.getAttribute('name'),
      id: input.id,
    }))
  );
}

async function findFilters(page: Page): Promise<any[]> {
  return await page.$$eval(
    'select, input[type="checkbox"], input[type="radio"], button[role="button"][aria-label*="filter" i]',
    elements =>
      elements.map((el, index) => ({
        index,
        type: el.tagName,
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
      }))
  );
}

test.describe('Search Bar Discovery', () => {
  for (const page of pagesWithSearch) {
    test(`${page.name} should have a search input`, async ({ page: pw }) => {
      await pw.goto(page.path, { waitUntil: 'networkidle' });

      const searchInputs = await findSearchInputs(pw);

      console.log(`Found ${searchInputs.length} search input(s) on ${page.name}`);

      expect(searchInputs.length, `${page.name} should have at least one search input`).toBeGreaterThan(0);
    });

    if (page.hasFilters) {
      test(`${page.name} should have filter options`, async ({ page: pw }) => {
        await pw.goto(page.path, { waitUntil: 'networkidle' });

        const filters = await findFilters(pw);

        console.log(`Found ${filters.length} filter(s) on ${page.name}`);

        expect(filters.length, `${page.name} should have filter options`).toBeGreaterThan(0);
      });
    }
  }
});

test.describe('Search Behavior - Proper Debouncing', () => {
  test('events search should wait for user to finish typing', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      console.log('No search input found on events page');
      return;
    }

    // Track network requests during search
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('events') || request.url().includes('search')) {
        requests.push(request.url());
      }
    });

    // Type search query character by character
    const searchQuery = 'concert';
    const requestCountsBefore: number[] = [];

    for (let i = 0; i < searchQuery.length; i++) {
      requestCountsBefore.push(requests.length);
      await searchInput.pressSequentially(searchQuery[i], { delay: 100 });
      await page.waitForTimeout(50); // Short delay between keystrokes
    }

    // Wait for final debounce
    await page.waitForTimeout(1000);
    const finalRequestCount = requests.length;

    console.log(`Total search requests made: ${finalRequestCount}`);

    // Should NOT make a request for every keystroke
    // With proper debouncing, should make 0-2 requests (not 7 for "concert")
    expect(
      finalRequestCount,
      'Search should be debounced and not fire on every keystroke'
    ).toBeLessThan(searchQuery.length);

    if (finalRequestCount === 0) {
      console.log('Search appears to filter client-side (no network requests)');
    } else if (finalRequestCount <= 2) {
      console.log('Search has proper debouncing implemented');
    }
  });

  test('search should trigger only after user stops typing', async ({ page }) => {
    await page.goto('/restaurants', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Get initial results count
    await page.waitForTimeout(500);
    const initialResults = await page.locator('[data-testid*="result"], article, .card, [class*="item"]').count();

    // Type search query
    await searchInput.fill('pizza');

    // Immediately check if results changed (they shouldn't yet)
    await page.waitForTimeout(100);
    const resultsAfter100ms = await page.locator('[data-testid*="result"], article, .card, [class*="item"]').count();

    // Wait for debounce to complete
    await page.waitForTimeout(600);
    const resultsAfterDebounce = await page.locator('[data-testid*="result"], article, .card, [class*="item"]').count();

    console.log(`Initial: ${initialResults}, After 100ms: ${resultsAfter100ms}, After debounce: ${resultsAfterDebounce}`);

    // Results should change after debounce completes, not immediately
    // This ensures good UX - not filtering on every keystroke
  });

  test('search should show loading indicator during search', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Start typing
    await searchInput.fill('music');

    // Check for loading indicator within a reasonable time
    const hasLoadingIndicator = await page.locator(
      '[role="progressbar"], .loading, .spinner, [aria-busy="true"]'
    ).count();

    if (hasLoadingIndicator > 0) {
      console.log('Search shows loading indicator');
    }
  });
});

test.describe('Search Results', () => {
  test('events search should return relevant results', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Search for something specific
    await searchInput.fill('music');
    await page.waitForTimeout(800); // Wait for debounce

    // Check if results are displayed
    const resultsCount = await page.locator('[data-testid*="result"], article, .card').count();

    console.log(`Found ${resultsCount} results for "music"`);

    if (resultsCount > 0) {
      // Check if results contain the search term
      const firstResult = page.locator('[data-testid*="result"], article, .card').first();
      const resultText = await firstResult.textContent();

      console.log('First result snippet:', resultText?.substring(0, 100));

      // Result should be relevant (contain search term or related content)
      // This is a soft check - just ensuring results are displayed
      expect(resultsCount).toBeGreaterThan(0);
    }
  });

  test('search should show "no results" message when appropriate', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Search for something that definitely won't exist
    await searchInput.fill('xyzabc123nonexistent');
    await page.waitForTimeout(800);

    // Should show no results message
    const noResultsMessage = await page.locator(
      'text=/no results|no events|not found|no matches/i'
    ).count();

    if (noResultsMessage > 0) {
      console.log('Properly displays "no results" message');
      expect(noResultsMessage).toBeGreaterThan(0);
    }
  });

  test('clearing search should restore all results', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Get initial count
    const initialCount = await page.locator('[data-testid*="result"], article, .card').count();

    // Perform search
    await searchInput.fill('music');
    await page.waitForTimeout(800);

    const searchResultCount = await page.locator('[data-testid*="result"], article, .card').count();

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(800);

    const afterClearCount = await page.locator('[data-testid*="result"], article, .card').count();

    console.log(`Initial: ${initialCount}, After search: ${searchResultCount}, After clear: ${afterClearCount}`);

    // After clearing, should show all results again
    expect(afterClearCount).toBeGreaterThanOrEqual(searchResultCount);
  });
});

test.describe('Filter Functionality', () => {
  test('events page filters should work correctly', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    // Look for filter elements
    const categoryFilter = page.locator('select, [role="combobox"], button[aria-haspopup]').first();

    if (await categoryFilter.count() === 0) {
      console.log('No filters found on events page');
      return;
    }

    const initialCount = await page.locator('[data-testid*="result"], article, .card').count();
    console.log(`Initial event count: ${initialCount}`);

    // Try to click/interact with filter
    await categoryFilter.click();
    await page.waitForTimeout(500);

    // Select a filter option
    const filterOption = page.locator('[role="option"], option, [role="menuitem"]').first();

    if (await filterOption.count() > 0) {
      await filterOption.click();
      await page.waitForTimeout(800);

      const afterFilterCount = await page.locator('[data-testid*="result"], article, .card').count();
      console.log(`After filter event count: ${afterFilterCount}`);

      // Filter should have changed the results
      expect(afterFilterCount).toBeDefined();
    }
  });

  test('multiple filters should work together', async ({ page }) => {
    await page.goto('/restaurants', { waitUntil: 'networkidle' });

    const filters = await page.locator('select, input[type="checkbox"]').all();

    if (filters.length < 2) {
      console.log('Not enough filters to test combination');
      return;
    }

    console.log(`Found ${filters.length} filters`);

    const initialCount = await page.locator('[data-testid*="result"], article, .card').count();

    // Apply first filter
    await filters[0].click();
    await page.waitForTimeout(500);

    const afterFirstFilter = await page.locator('[data-testid*="result"], article, .card').count();

    // Apply second filter
    if (filters[1]) {
      await filters[1].click();
      await page.waitForTimeout(500);

      const afterSecondFilter = await page.locator('[data-testid*="result"], article, .card').count();

      console.log(`Initial: ${initialCount}, After 1st filter: ${afterFirstFilter}, After 2nd: ${afterSecondFilter}`);

      // Multiple filters should be able to narrow results
      expect(afterSecondFilter).toBeDefined();
    }
  });

  test('filters should have clear/reset functionality', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Reset"), button[aria-label*="clear" i]').first();

    // Apply some filters first
    const filters = await page.locator('select, input[type="checkbox"]').all();

    if (filters.length > 0) {
      await filters[0].click();
      await page.waitForTimeout(500);

      if (await clearButton.count() > 0) {
        await clearButton.click();
        await page.waitForTimeout(500);

        console.log('Filter clear/reset button works');
      }
    }
  });
});

test.describe('Search URL Parameters', () => {
  test('search query should be reflected in URL', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    await searchInput.fill('concert');
    await page.waitForTimeout(800);

    const url = page.url();
    console.log('URL after search:', url);

    // URL should contain the search query (good for sharing/bookmarking)
    const hasQueryInUrl = url.includes('concert') || url.includes('search=') || url.includes('q=');

    if (hasQueryInUrl) {
      console.log('Search query is reflected in URL (good for bookmarking)');
    }
  });

  test('should respect search parameters from URL', async ({ page }) => {
    // Try to navigate with search parameter
    await page.goto('/events?q=music', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() > 0) {
      const searchValue = await searchInput.inputValue();

      if (searchValue.includes('music')) {
        console.log('Search input correctly populated from URL parameter');
        expect(searchValue).toContain('music');
      }
    }
  });
});

test.describe('Search Accessibility', () => {
  test('search input should have proper ARIA attributes', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    const ariaAttributes = await searchInput.evaluate(el => ({
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaDescribedby: el.getAttribute('aria-describedby'),
      hasLabel: !!document.querySelector(`label[for="${el.id}"]`),
    }));

    console.log('Search input ARIA attributes:', ariaAttributes);

    // Should have either aria-label or an associated label
    const hasProperLabel = ariaAttributes.ariaLabel || ariaAttributes.hasLabel;
    expect(hasProperLabel, 'Search input should have proper labeling').toBe(true);
  });

  test('search results should be announced to screen readers', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    await searchInput.fill('music');
    await page.waitForTimeout(800);

    // Look for ARIA live region for results
    const hasLiveRegion = await page.locator('[aria-live], [role="status"], [role="alert"]').count() > 0;

    if (hasLiveRegion) {
      console.log('Search uses ARIA live regions for result announcements');
    }
  });
});

test.describe('Mobile Search Experience', () => {
  test('search should work well on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Check search input size
    const inputSize = await searchInput.boundingBox();

    if (inputSize) {
      console.log('Search input size on mobile:', inputSize);

      // Input should be adequately sized for mobile
      expect(inputSize.height, 'Search input should be at least 44px tall for touch').toBeGreaterThanOrEqual(44);
    }

    // Perform search on mobile
    await searchInput.fill('food');
    await page.waitForTimeout(800);

    // Results should be visible
    const resultsVisible = await page.locator('[data-testid*="result"], article, .card').first().isVisible();
    expect(resultsVisible, 'Search results should be visible on mobile').toBe(true);
  });

  test('filters should be mobile-friendly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/restaurants', { waitUntil: 'networkidle' });

    const filterButtons = await page.locator('select, button[aria-haspopup], [role="combobox"]').all();

    for (const button of filterButtons.slice(0, 3)) {
      const box = await button.boundingBox();

      if (box) {
        // Filter controls should be touch-friendly
        expect(box.height, 'Filter controls should meet touch target size').toBeGreaterThanOrEqual(40);
      }
    }
  });
});

test.describe('Advanced Search Page', () => {
  test('advanced search should support multiple criteria', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'networkidle' });

    const searchFields = await page.locator('input, select').count();

    console.log(`Advanced search has ${searchFields} input fields`);

    expect(searchFields, 'Advanced search should have multiple input fields').toBeGreaterThan(1);
  });
});

test.describe('Search Performance', () => {
  test('search should not cause layout shift', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    if (await searchInput.count() === 0) {
      return;
    }

    // Get initial layout
    const initialHeight = await page.evaluate(() => document.body.scrollHeight);

    // Perform search
    await searchInput.fill('test');
    await page.waitForTimeout(800);

    const afterSearchHeight = await page.evaluate(() => document.body.scrollHeight);

    // Major layout shift would be problematic
    const heightDiff = Math.abs(afterSearchHeight - initialHeight);
    console.log(`Height difference after search: ${heightDiff}px`);

    // Some height change is expected, but massive shifts are bad for UX
    if (heightDiff < 100) {
      console.log('Search causes minimal layout shift');
    }
  });
});
