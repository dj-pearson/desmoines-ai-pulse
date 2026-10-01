import { test, expect } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-UX-003 — sticky filter bar, removable chips, visible result count.
 *
 * Loads each list page with a search filter in the URL and verifies the active-
 * filter chip renders (all viewports incl. mobile projects), the result count is
 * visible, and removing the chip clears the filter from the URL.
 *
 * RUNS AGAINST FIXTURES (WEB-CI-028 AC2). A chip and a count are both things
 * the page renders ABOUT results, so with the smoke lane's placeholder backend
 * there is nothing for them to describe and the spec could never be wired into
 * a lane. installFixtureBackend supplies rows; it does not emulate filtering,
 * which is deliberate - see its header.
 */

const listPages = [
  { path: '/events', name: 'events' },
  { path: '/restaurants', name: 'restaurants' },
  { path: '/attractions', name: 'attractions' },
];

test.describe('Sticky filter bar + chips (WEB-UX-003)', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtureBackend(page);
  });

  for (const { path, name } of listPages) {
    test(`${name}: active search renders a removable chip that clears the URL`, async ({ page }) => {
      await page.goto(`${path}?q=jazz`);
      await page.waitForLoadState('networkidle');

      // "Active filters:" label + a chip referencing the query are present.
      await expect(page.getByText(/active filters/i)).toBeVisible();
      const removeChip = page.getByRole('button', { name: /remove .*jazz/i }).first();
      await expect(removeChip).toBeVisible();

      // Removing the chip drops the query from the URL.
      await removeChip.click();
      await expect(page).not.toHaveURL(/[?&]q=jazz/i);
    });

    test(`${name}: result count is visible`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Each page renders a visible count ("N results" / "... events" / "Showing ...").
      await expect(
        page.getByText(/\d+\s+(results?|events|restaurants)|showing\s+\d+/i).first()
      ).toBeVisible();
    });
  }
});
