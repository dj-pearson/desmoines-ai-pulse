import { test, expect } from '@playwright/test';

/**
 * Route smoke tests — a route that mounts must NOT fall into the route-level
 * error boundary ("This page encountered an error").
 *
 * Regression guard for WEB-QA-001: /advertise threw React #130 (undefined
 * component) because a PlacementType ('sidebar') was added to placementSpecs
 * without a matching ICON_MAP entry, so <Icon /> rendered `undefined`.
 * These B2B/monetization routes are the primary self-serve conversion paths,
 * so a hard crash there directly loses revenue and must be caught in CI.
 */

// Text rendered by RouteErrorBoundary's fallback (src/components/ui/route-error-boundary.tsx)
const ERROR_BOUNDARY_TEXT = 'This page encountered an error';

const b2bRoutes = ['/advertise', '/business-partnership'];

for (const route of b2bRoutes) {
  test(`${route} mounts without hitting the error boundary`, async ({ page }) => {
    // `networkidle` is unreliable here — the app keeps persistent Supabase
    // realtime connections open, so it never fires. Wait for the DOM + the
    // page's real content instead.
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // Real page content must render (proves the component actually mounted).
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
    ).toBeVisible({ timeout: 15000 });

    // The route-level error boundary must not be rendered.
    await expect(
      page.getByText(ERROR_BOUNDARY_TEXT, { exact: false }),
    ).toHaveCount(0);
  });
}
