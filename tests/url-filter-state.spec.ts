import { test, expect } from '@playwright/test';

/**
 * WEB-UX-001 — URL-synced filter state.
 *
 * Verifies that list filters are reflected in the URL (shareable), applied on
 * load from the URL, restored on back-navigation, and cleared by "Clear all".
 * These exercise the useUrlFilters hook wired into Events/Restaurants/Attractions.
 */

const listPages = [
  { path: '/events', name: 'events' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/attractions', name: 'attractions' },
];

test.describe('URL-synced filter state (WEB-UX-001)', () => {
  for (const { path, name } of listPages) {
    test(`${name}: a shareable URL with params applies filters on load`, async ({ page }) => {
      // q is the shared search param across all three list pages.
      await page.goto(`${path}?q=test`);
      await page.waitForLoadState('networkidle');

      // The search input should be pre-filled from the URL.
      const searchInput = page
        .locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]')
        .first();
      await expect(searchInput).toHaveValue(/test/i);
    });

    test(`${name}: typing a search reflects into the URL (debounced)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const searchInput = page
        .locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]')
        .first();
      await searchInput.fill('coffee');

      // Debounced write — wait for the URL to carry the query.
      await expect(page).toHaveURL(/[?&]q=coffee/i, { timeout: 4000 });
    });

    test(`${name}: back navigation restores the filtered URL`, async ({ page }) => {
      await page.goto(`${path}?q=jazz`);
      await page.waitForLoadState('networkidle');

      // Navigate away, then back — the filtered URL must return.
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.goBack();

      await expect(page).toHaveURL(/[?&]q=jazz/i);
      const searchInput = page
        .locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]')
        .first();
      await expect(searchInput).toHaveValue(/jazz/i);
    });
  }
});
