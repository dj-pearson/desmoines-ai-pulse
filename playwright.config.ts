import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/**
 * A locally installed Chromium, when Playwright's own download is absent or at
 * a different revision (WEB-CI-028). Inert in CI, where the browsers Playwright
 * expects are installed by the workflow. See TESTING.md for why this is needed
 * in a container: Playwright looks for chrome-headless-shell at the revision it
 * shipped with, and a preinstalled full chromium is at a different path.
 */
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: './tests',
  // route-smoke.spec.ts must run against a production build, not the dev server —
  // see playwright.smoke.config.ts for why. Run it with `npm run test:smoke`.
  testIgnore: 'route-smoke.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 2, // Limit to 2 parallel workers to avoid overwhelming the system
  /* Increase timeout for comprehensive tests */
  timeout: 60000, // 60 seconds per test (was 30 seconds)
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8080',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Increase navigation timeout for slower pages */
    navigationTimeout: 30000, // 30 seconds for page loads
    actionTimeout: 15000, // 15 seconds for actions like clicks
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080, ...localChromium }
      },
    },

    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080, ...localChromium }
      },
    },

    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080, ...localChromium }
      },
    },

    /* Test against mobile viewports - PRIMARY FOCUS */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'], ...localChromium },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'], ...localChromium },
    },
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad Pro'], ...localChromium },
    },

    /* Additional mobile devices for comprehensive testing */
    {
      name: 'mobile-small',
      use: {
        ...devices['iPhone SE'],
        ...localChromium,
      },
    },
    {
      name: 'mobile-large',
      use: {
        ...devices['Pixel 5'],
        ...localChromium,
      },
    },
    {
      name: 'tablet-landscape',
      use: {
        ...devices['iPad Pro landscape'],
        ...localChromium,
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
