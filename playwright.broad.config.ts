import { defineConfig, devices } from '@playwright/test';

/**
 * Broad-suites config (WEB-CI-037) - the quarantined `e2e` lane in e2e.yml:
 * accessibility (minus the axe block), links-and-buttons, forms and
 * mobile-responsive, on chromium-desktop and mobile-chrome.
 *
 * WHY THIS LANE HAD ITS OWN CONFIG MADE FOR IT. It used playwright.config.ts,
 * which on CI means one worker against a cold `vite` dev server. The run on
 * 2026-11-07 (job 128535161849) hit its 25-minute --global-timeout with
 * "489 passed, 15 failed, 1 interrupted, 103 did not run" out of 608, and the
 * job showed green because the step is continue-on-error. The four green
 * runs before it stopped at the same wall with 13, 54, 95 and 103 tests never
 * started, so "five green runs" (WEB-CI-028 AC4's bar for promoting
 * forms/accessibility) was counting runs that checked part of the lane.
 * The same 608 tests on a production build at two workers: 10.2 minutes.
 *
 * Same cure the a11y and smoke lanes took: a production build and Playwright's
 * default worker count. The dev server pays an on-demand transform on every
 * first page load, and one worker serialises 608 tests behind it.
 *
 * Timeouts are playwright.config.ts's, so a test that passed there is not
 * failed here by a tighter budget. Retries are 1 on CI, as in the a11y lane:
 * a test that passes on retry is still reported as flaky, and the second
 * retry was what a failing test spent its last 60 seconds on.
 *
 * `vite build`, not `npm run build`: nothing here reads the sitemaps or the
 * prerendered pages that the full script also produces.
 *
 * Usage: npm run test:broad
 */

/**
 * A locally installed Chromium, when Playwright's own download is absent or at
 * a different revision (WEB-CI-028). Inert in CI. See TESTING.md.
 */
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

const PORT = 4175;

export default defineConfig({
  testDir: './tests',
  testMatch: /(accessibility|links-and-buttons|forms|mobile-responsive)\.spec\.ts/,
  // The axe block has its own required lane (playwright.a11y.config.ts).
  grepInvert: /Automated Accessibility Testing with Axe/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, ...localChromium },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'], ...localChromium },
    },
  ],

  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
