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
  // WEB-LEGAL-009 AC5: cookie-consent.spec.ts is here rather than in the broad
  // lane on purpose. It is the only check that would have caught WEB-LEGAL-001
  // (GA4 firing for every visitor), and the broad lane is quarantined with
  // continue-on-error, so a consent regression there could not fail a build.
  // A production build is also the more faithful environment for it: the
  // consent gate lives in an inline script in index.html that is pinned by a
  // CSP hash, and only a real build serves the bytes the browser will get.
  testMatch: /(route-smoke|cookie-consent)\.spec\.ts/,
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
