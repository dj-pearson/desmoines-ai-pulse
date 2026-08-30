import { defineConfig, devices } from '@playwright/test';

/**
 * Axe accessibility config (WEB-CI-021) — the axe block against a PRODUCTION
 * BUILD, on the required `a11y-axe` lane in e2e.yml.
 *
 * WHY NOT THE DEV-SERVER CONFIG, measured rather than assumed. The first
 * attempt reused playwright.config.ts and ran 1.2 minutes locally and OVER 20
 * MINUTES in CI, where the job was killed at its timeout. The difference is the
 * dev server: locally it is already warm and Vite's transform cache is
 * populated, so `reuseExistingServer: !process.env.CI` hands the tests a hot
 * server. In CI it is cold, and every first page load pays on-demand transform
 * for a large app. The accessibility spec allows 120s per test, so 48 tests
 * against a cold dev server can outrun any job budget the lane is given.
 *
 * A production build also scans what production actually serves, which is the
 * point of the gate: axe reads the rendered DOM, and the dev server's DOM is
 * not the shipped one.
 *
 * `vite build`, not `npm run build`, for the same reason the smoke config gives:
 * the full script also runs generate-sitemaps and prerender, and prerender
 * drives a headless Chromium over 35 hub routes. Nothing here reads prerendered
 * output — every scan navigates client-side and waits for the live DOM.
 *
 * Usage: npm run test:a11y:axe
 */
export default defineConfig({
  testDir: './tests',
  testMatch: 'accessibility.spec.ts',
  grep: /Automated Accessibility Testing with Axe/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Axe is deterministic against a fixed DOM, so a retry only ever papers over
  // a navigation flake. One retry in CI, none locally.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:4174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // One project. The same DOM scanned at two viewports finds the same
  // violations, and doubling a required gate's runtime buys nothing. Responsive
  // accessibility has its own describe block in the advisory lane.
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],

  webServer: {
    // Port 4174, not the smoke lane's 4173, so the two can run concurrently on
    // one machine without fighting over the port.
    command: 'npx vite build && npx vite preview --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
