import { test, expect } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore pass 2 WP1 item 6: the Explore row (ExploreSectionLinks) is on all
 * eight Explore pages, and on each one exactly one link carries
 * aria-current="page": the page's own section.
 *
 * WP1 mounts it on /things-to-do; WP2-WP6 mount it on the other seven with
 * one import line each. Until those land, their rows here fail, which is the
 * point of a spec that names all eight.
 */

const EXPLORE_ROUTES = [
  '/things-to-do',
  '/map',
  '/attractions',
  '/playgrounds',
  '/music',
  '/sports',
  '/outdoors',
  '/deals',
] as const;

for (const route of EXPLORE_ROUTES) {
  test(`${route} has the Explore row with one aria-current link`, async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const row = page.locator('[data-explore-section-links]');
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row).toBeVisible();

    const current = row.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', route);

    // Every other Explore page is one click away from this one.
    for (const other of EXPLORE_ROUTES) {
      await expect(row.locator(`a[href="${other}"]`), other).toHaveCount(1);
    }
  });
}
