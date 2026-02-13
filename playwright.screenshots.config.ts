import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Playwright config for store screenshot capture.
 * Extends the base config but overrides testDir to find scripts/ files,
 * and increases timeout since we're capturing ~200 screenshots.
 */
export default defineConfig({
  ...baseConfig,
  testDir: '.',
  testMatch: 'scripts/capture-store-screenshots.ts',
  timeout: 300000, // 5 minutes per test (screenshot capture is slow)
  retries: 1, // Retry once on transient failures (connection drops, etc.)
  workers: 2, // Allow some parallelism for faster completion
  reporter: [['list']],
  // Auto-start web server, reuse if already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
