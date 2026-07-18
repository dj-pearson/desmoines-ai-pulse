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
  testMatch: 'route-smoke.spec.ts',
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
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
