import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke config — runs tests/route-smoke.spec.ts against a PRODUCTION BUILD.
 *
 * Why not the normal dev-server config (playwright.config.ts):
 *
 * 1. The bugs these tests guard (WEB-QA-001/002/003) are bundling-sensitive. A
 *    named import with no matching export is a hard SyntaxError under the dev
 *    server's native ESM, but silently becomes `undefined` once bundled — which
 *    is what actually reached production as React error #130. Only a real build
 *    reproduces the shipped failure mode.
 *
 * 2. `leaflet` is intentionally excluded from optimizeDeps (see vite.config.ts),
 *    so react-leaflet's named imports fail under the dev server on any page with
 *    a map — including event detail pages. That is a dev-only artifact and would
 *    make these tests fail for a reason unrelated to what they assert.
 *
 * Usage: npm run test:smoke
 */
export default defineConfig({
  testDir: './tests',
  // cookie-consent.spec.ts joins route-smoke here for WEB-LEGAL-009 AC5.
  //
  // It already asserted the right thing - reject analytics, then check that no
  // googletagmanager request is made and no _ga cookie is set - and it lived in
  // the QUARANTINED broad lane, which e2e.yml runs non-blocking. A compliance
  // check that cannot fail a PR is decorative, and WEB-LEGAL-001 is the exact
  // defect that shipped while a document said it was fixed.
  //
  // request-budget.spec.ts generalises that to every main route: no endpoint
  // may be called more than 20 times on one page load. WEB-PERF-043.
  //
  // search-request-loop.spec.ts counts REQUESTS rather than checking the DOM:
  // an effect keyed on an unstable callback fired nlp-search 82 times in 16
  // seconds for one query, and the page just looked empty while it did.
  // WEB-QA-033.
  //
  // page-headings.spec.ts asserts one <h1> per route, including when the data
  // fails - axe's page-has-heading-one is a best-practice rule outside the
  // wcag2aa tag set accessibility.spec.ts filters to, so nothing caught it.
  // WEB-A11Y-002.
  //
  // touch-targets.spec.ts is here too: it measures rendered footer link boxes
  // at 375px under a coarse pointer, which is computed layout behind a media
  // query - nothing a source-text check can see. WEB-UX-036.
  //
  // backend-down.spec.ts is here for the same reason: it aborts every Supabase
  // request and asserts no reader-facing route answers "No items available in
  // this category right now". That is a runtime property - the TanStack pages
  // reach their empty state only after retries are exhausted - so no
  // source-text check can establish it. WEB-QA-032.
  //
  // It belongs here specifically because it asserts REAL BROWSER BEHAVIOUR -
  // network requests and cookies - which no source-text check can establish.
  // scripts/check-consent-gate.mjs covers the source side; this covers what
  // actually happens.
  testMatch: /(route-smoke|cookie-consent|backend-down|touch-targets|page-headings|search-request-loop|request-budget)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // `vite build`, not `npm run build`. The full script also runs
    // generate-sitemaps and prerender, and prerender drives a headless Chromium
    // over 35 hub routes with a 20s content wait and an 8s Helmet wait apiece.
    // When those waits are hit the step alone outruns the 300s budget below and
    // the required lane fails with "Timed out waiting from config.webServer" —
    // a network-timing failure that says nothing about the code under test.
    //
    // Nothing in route-smoke.spec.ts reads prerendered output: every assertion
    // is client-side runtime behaviour (console errors, React #130, PostgREST
    // status codes, route mounting). What the suite does need is a real bundle,
    // because a named import with no matching export only becomes an undefined
    // component once bundled — and `vite build` produces exactly that.
    command: 'npx vite build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
