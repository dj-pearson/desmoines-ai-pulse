import { test, expect, type Page } from '@playwright/test';

/**
 * WEB-QA-001 / WEB-QA-002 / WEB-QA-003 — production regressions found in the
 * 2026-07-13 QA pass.
 *
 * These are deliberately shallow "does it mount, does it not error" checks. They
 * exist because all three bugs shipped to production while every existing suite
 * stayed green — nothing asserted that a route actually rendered instead of
 * falling into the error boundary.
 */

/** Copy rendered by src/components/ui/route-error-boundary.tsx. */
const ROUTE_ERROR_TEXT = 'This page encountered an error';
/** Copy rendered by src/components/ui/error-boundary.tsx. */
const GENERIC_ERROR_TEXT = 'Something went wrong';

/** Collect console errors so a route that "renders" but logs DB failures still fails. */
function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText(ROUTE_ERROR_TEXT)).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR_TEXT)).toHaveCount(0);
}

test.describe('Route smoke: monetization / B2B pages mount (WEB-QA-001)', () => {
  // React error #130 (undefined component) took /advertise down entirely. Audit
  // the sibling revenue routes reachable from the footer at the same time.
  const routes = ['/advertise', '/business-partnership'];

  for (const route of routes) {
    test(`${route} mounts without hitting the error boundary`, async ({ page }) => {
      const consoleErrors = captureConsoleErrors(page);

      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle');

      await expectNoErrorBoundary(page);

      // React #130 surfaces as a minified invariant in production builds.
      const invariantErrors = consoleErrors.filter((e) => /Minified React error #130|Element type is invalid/i.test(e));
      expect(invariantErrors, `React #130 on ${route}: ${invariantErrors.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Homepage data fetches succeed (WEB-QA-003)', () => {
  test('homepage loads with no events/ads query errors', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expectNoErrorBoundary(page);

    // The specific regressions: a bad column in the events projection (42703) and
    // an unservable ad placement. Both logged on every single homepage load.
    const dataErrors = consoleErrors.filter((e) =>
      /fetchEvents|useEvents|fetchActiveAd|useActiveAds|42703|PGRST/i.test(e)
    );
    expect(dataErrors, `data-layer errors on /: ${dataErrors.join('\n')}`).toHaveLength(0);
  });

  test('events REST query returns 2xx', async ({ page }) => {
    const failedEventRequests: string[] = [];

    page.on('response', (res) => {
      const url = res.url();
      if (/\/rest\/v1\/events/.test(url) && res.status() >= 400) {
        failedEventRequests.push(`${res.status()} ${url}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(failedEventRequests, failedEventRequests.join('\n')).toHaveLength(0);
  });
});

test.describe('Content routes survive their schema projections (WEB-QA-017)', () => {
  /**
   * Each of these routes named a column that does not exist on public.events or
   * public.attractions. PostgREST rejects the WHOLE projection with 42703 when
   * any single column is unknown, so the page rendered zero rows — silently,
   * because the hook catches the error and falls into its empty state. Nothing
   * in the UI distinguishes "no results" from "the query was rejected", which is
   * why these sat broken.
   *
   * The static guard (scripts/check-schema-usage.mjs) catches the reintroduction
   * of a bad column name at CI time. These assert the runtime consequence, since
   * the guard can only see literal select strings.
   */
  const routes = [
    { path: '/events/west-des-moines', was: 'selected events.time and events.status' },
    { path: '/events/july-2026', was: 'ordered by events.time' },
    { path: '/map', was: 'selected events.description and attractions.category' },
  ];

  for (const { path, was } of routes) {
    test(`${path} issues no rejected PostgREST queries (${was})`, async ({ page }) => {
      const consoleErrors = captureConsoleErrors(page);
      const rejected: string[] = [];

      page.on('response', (res) => {
        // Scoped to the CONTENT tables these routes project from. A blanket
        // "no 4xx on /rest/v1" would also fail on user_analytics, which 400s
        // on every page load for an unrelated reason: usePageTracking writes a
        // pathname into a NOT NULL uuid column (WEB-QA-013). Migration
        // 20260718000002 fixes that and is not yet applied, so asserting on it
        // here would couple this test to a deploy and hide the regression it
        // actually guards. Widen this pattern once that ships.
        if (/\/rest\/v1\/(events|attractions|restaurants)\b/.test(res.url()) && res.status() >= 400) {
          rejected.push(`${res.status()} ${res.url()}`);
        }
      });

      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle');

      await expectNoErrorBoundary(page);

      expect(
        rejected,
        `${path} made REST request(s) the database rejected:\n${rejected.join('\n')}`
      ).toHaveLength(0);

      // 42703 is the specific failure these routes regressed on; PGRST covers
      // the schema-cache errors (PGRST202/203/204) in the same family. Filtered
      // to the content tables for the WEB-QA-013 reason described above.
      const schemaErrors = consoleErrors.filter(
        (e) => /42703|PGRST\d{3}|does not exist/i.test(e) && !/user_analytics/i.test(e)
      );
      expect(schemaErrors, `schema errors on ${path}: ${schemaErrors.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Listed events resolve to a detail page (WEB-QA-002)', () => {
  test('a sample of event cards from the listing all render a detail page', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // Event cards link to /events/<slug>. Sample the first few rather than every
    // card, to keep this fast while still catching a systemic list/detail split.
    const links = page.locator('a[href^="/events/"]');
    const count = await links.count();
    test.skip(count === 0, 'No events currently listed — nothing to verify.');

    const sampleSize = Math.min(count, 5);
    const hrefs: string[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href && !hrefs.includes(href)) hrefs.push(href);
    }

    for (const href of hrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle');

      // The exact dead-end the QA pass hit: a listed event 404ing on its detail.
      await expect(
        page.getByText('Event Not Found'),
        `Listed event ${href} dead-ends on "Event Not Found"`
      ).toHaveCount(0);

      await expectNoErrorBoundary(page);
    }
  });
});
