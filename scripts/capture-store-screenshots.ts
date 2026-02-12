/**
 * App Store & Google Play Screenshot Capture Script
 *
 * Automatically captures screenshots at every required device size
 * for Apple App Store and Google Play Store submissions.
 *
 * Usage:
 *   npx playwright test scripts/capture-store-screenshots.ts
 *
 * Or via npm script:
 *   npm run screenshots:stores
 *
 * Output:
 *   screenshots/
 *   ├── apple/
 *   │   ├── iphone-6.9/          # 1260x2736 — iPhone 16 Pro Max (REQUIRED)
 *   │   ├── iphone-6.5/          # 1242x2688 — iPhone 11 Pro Max
 *   │   ├── iphone-6.3/          # 1206x2622 — iPhone 16 Pro
 *   │   ├── iphone-5.5/          # 1242x2208 — iPhone 8 Plus
 *   │   ├── ipad-13/             # 2064x2752 — iPad Pro 13" (REQUIRED)
 *   │   └── ipad-11/             # 1668x2388 — iPad Pro 11"
 *   ├── google/
 *   │   ├── phone/               # 1080x1920 — Android phone
 *   │   ├── tablet-7/            # 1200x1920 — 7" tablet
 *   │   └── tablet-10/           # 1600x2560 — 10" tablet
 *   └── metadata/
 *       └── manifest.json        # Screenshot inventory with paths and metadata
 *
 * Requirements:
 *   - Playwright installed: npx playwright install chromium
 *   - Dev server running: npm run dev (or pass PLAYWRIGHT_TEST_BASE_URL)
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const BASE_OUTPUT_DIR = path.resolve(__dirname, '..', 'screenshots');
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8080';

/**
 * App screens to capture. These are the screens that best showcase
 * the app's functionality for store reviewers and users.
 *
 * Order matters — the first 3-5 screenshots are what users see in search results.
 */
const APP_SCREENS: Array<{
  name: string;
  path: string;
  description: string;
  waitForSelector?: string;
  scrollTo?: number;
  actions?: (page: Page) => Promise<void>;
}> = [
  {
    name: '01-home',
    path: '/',
    description: 'Homepage — Discover Des Moines',
    waitForSelector: 'main',
  },
  {
    name: '02-events',
    path: '/events',
    description: 'Events — Browse upcoming events',
    waitForSelector: 'main',
  },
  {
    name: '03-restaurants',
    path: '/restaurants',
    description: 'Restaurants — Local dining guide',
    waitForSelector: 'main',
  },
  {
    name: '04-attractions',
    path: '/attractions',
    description: 'Attractions — Things to do',
    waitForSelector: 'main',
  },
  {
    name: '05-trip-planner',
    path: '/trip-planner',
    description: 'AI Trip Planner — Plan your visit',
    waitForSelector: 'main',
  },
  {
    name: '06-events-today',
    path: '/events/today',
    description: 'Today — What\'s happening now',
    waitForSelector: 'main',
  },
  {
    name: '07-weekend',
    path: '/weekend',
    description: 'Weekend Guide — Weekend plans',
    waitForSelector: 'main',
  },
  {
    name: '08-neighborhoods',
    path: '/neighborhoods',
    description: 'Neighborhoods — Explore areas',
    waitForSelector: 'main',
  },
  {
    name: '09-search',
    path: '/search',
    description: 'Search — Find anything',
    waitForSelector: 'main',
  },
  {
    name: '10-pricing',
    path: '/pricing',
    description: 'Pricing — Subscription tiers',
    waitForSelector: 'main',
  },
];

/**
 * Device specifications for Apple App Store.
 *
 * Physical pixels = CSS pixels * deviceScaleFactor
 *
 * Apple requires the 6.9" iPhone and 13" iPad. The rest are optional
 * but recommended — Apple will auto-scale from 6.9" if missing.
 */
const APPLE_DEVICES: Array<{
  id: string;
  label: string;
  required: boolean;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  physicalPixels: { width: number; height: number };
  userAgent: string;
  isMobile: boolean;
  hasTouch: boolean;
}> = [
  {
    id: 'iphone-6.9',
    label: '6.9" iPhone (iPhone 16 Pro Max)',
    required: true,
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    physicalPixels: { width: 1320, height: 2868 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'iphone-6.5',
    label: '6.5" iPhone (iPhone 11 Pro Max)',
    required: false,
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 3,
    physicalPixels: { width: 1242, height: 2688 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'iphone-6.3',
    label: '6.3" iPhone (iPhone 16 Pro)',
    required: false,
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    physicalPixels: { width: 1206, height: 2622 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'iphone-5.5',
    label: '5.5" iPhone (iPhone 8 Plus)',
    required: false,
    viewport: { width: 414, height: 736 },
    deviceScaleFactor: 3,
    physicalPixels: { width: 1242, height: 2208 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'ipad-13',
    label: '13" iPad Pro',
    required: true,
    viewport: { width: 1032, height: 1376 },
    deviceScaleFactor: 2,
    physicalPixels: { width: 2064, height: 2752 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    isMobile: false,
    hasTouch: true,
  },
  {
    id: 'ipad-11',
    label: '11" iPad Pro',
    required: false,
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    physicalPixels: { width: 1668, height: 2388 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    isMobile: false,
    hasTouch: true,
  },
];

/**
 * Device specifications for Google Play Store.
 *
 * Google requires at least phone screenshots. Tablet screenshots are
 * needed for tablet-optimized listings and promotional eligibility.
 */
const GOOGLE_DEVICES: Array<{
  id: string;
  label: string;
  required: boolean;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  physicalPixels: { width: number; height: number };
  userAgent: string;
  isMobile: boolean;
  hasTouch: boolean;
}> = [
  {
    id: 'phone',
    label: 'Android Phone (1080x1920)',
    required: true,
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    physicalPixels: { width: 1080, height: 1920 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'phone-hd',
    label: 'Android Phone HD (1440x2560)',
    required: false,
    viewport: { width: 412, height: 732 },
    deviceScaleFactor: 3.5,
    physicalPixels: { width: 1442, height: 2562 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'tablet-7',
    label: '7" Android Tablet (1200x1920)',
    required: false,
    viewport: { width: 600, height: 960 },
    deviceScaleFactor: 2,
    physicalPixels: { width: 1200, height: 1920 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    isMobile: false,
    hasTouch: true,
  },
  {
    id: 'tablet-10',
    label: '10" Android Tablet (1600x2560)',
    required: false,
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 2,
    physicalPixels: { width: 1600, height: 2560 },
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    isMobile: false,
    hasTouch: true,
  },
];

// ============================================================================
// Helper functions
// ============================================================================

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function waitForPageReady(page: Page, screen: typeof APP_SCREENS[0]): Promise<void> {
  // Wait for the main content to appear
  if (screen.waitForSelector) {
    try {
      await page.waitForSelector(screen.waitForSelector, { timeout: 15000 });
    } catch {
      // Continue even if selector times out — page may still be usable
    }
  }

  // Wait for network to settle (images, API calls)
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    // Network may not fully idle; continue after timeout
  }

  // Wait for any animations/transitions to complete
  await page.waitForTimeout(1500);

  // Scroll to specified position if needed
  if (screen.scrollTo) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), screen.scrollTo);
    await page.waitForTimeout(500);
  }

  // Execute any custom actions (e.g., dismissing modals)
  if (screen.actions) {
    await screen.actions(page);
  }
}

async function dismissOverlays(page: Page): Promise<void> {
  // Dismiss any welcome modals, cookie banners, etc.
  const dismissSelectors = [
    '[aria-label="Close"]',
    '[data-dismiss]',
    'button:has-text("Got it")',
    'button:has-text("Accept")',
    'button:has-text("Dismiss")',
    'button:has-text("Close")',
  ];

  for (const selector of dismissSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 500 })) {
        await button.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // Selector not found or not visible — that's fine
    }
  }
}

async function captureScreenshot(
  page: Page,
  outputPath: string,
): Promise<void> {
  // Ensure the output directory exists
  ensureDir(path.dirname(outputPath));

  // Take a full-page screenshot (not just viewport — captures below the fold)
  // For store screenshots, we want just the viewport (what users see on device)
  await page.screenshot({
    path: outputPath,
    type: 'png',
    fullPage: false,
    animations: 'disabled',
  });
}

// ============================================================================
// Test configuration — runs outside the normal test suite
// ============================================================================

test.describe.configure({ mode: 'serial', timeout: 300000 });

// ============================================================================
// Apple App Store Screenshots
// ============================================================================

test.describe('Apple App Store Screenshots', () => {
  for (const device of APPLE_DEVICES) {
    test.describe(`${device.label}${device.required ? ' (REQUIRED)' : ''}`, () => {
      for (const screen of APP_SCREENS) {
        test(`${screen.name} — ${screen.description}`, async ({ browser }) => {
          const context = await browser.newContext({
            viewport: device.viewport,
            deviceScaleFactor: device.deviceScaleFactor,
            userAgent: device.userAgent,
            isMobile: device.isMobile,
            hasTouch: device.hasTouch,
            colorScheme: 'light',
          });

          const page = await context.newPage();

          try {
            await page.goto(screen.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await waitForPageReady(page, screen);
            await dismissOverlays(page);

            // Light mode screenshot
            const lightPath = path.join(
              BASE_OUTPUT_DIR, 'apple', device.id, 'light', `${screen.name}.png`
            );
            await captureScreenshot(page, lightPath);

            // Dark mode screenshot
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.waitForTimeout(500);
            const darkPath = path.join(
              BASE_OUTPUT_DIR, 'apple', device.id, 'dark', `${screen.name}.png`
            );
            await captureScreenshot(page, darkPath);
          } finally {
            await context.close();
          }
        });
      }
    });
  }
});

// ============================================================================
// Google Play Store Screenshots
// ============================================================================

test.describe('Google Play Store Screenshots', () => {
  for (const device of GOOGLE_DEVICES) {
    test.describe(`${device.label}${device.required ? ' (REQUIRED)' : ''}`, () => {
      for (const screen of APP_SCREENS) {
        test(`${screen.name} — ${screen.description}`, async ({ browser }) => {
          const context = await browser.newContext({
            viewport: device.viewport,
            deviceScaleFactor: device.deviceScaleFactor,
            userAgent: device.userAgent,
            isMobile: device.isMobile,
            hasTouch: device.hasTouch,
            colorScheme: 'light',
          });

          const page = await context.newPage();

          try {
            await page.goto(screen.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await waitForPageReady(page, screen);
            await dismissOverlays(page);

            // Light mode screenshot
            const lightPath = path.join(
              BASE_OUTPUT_DIR, 'google', device.id, 'light', `${screen.name}.png`
            );
            await captureScreenshot(page, lightPath);

            // Dark mode screenshot
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.waitForTimeout(500);
            const darkPath = path.join(
              BASE_OUTPUT_DIR, 'google', device.id, 'dark', `${screen.name}.png`
            );
            await captureScreenshot(page, darkPath);
          } finally {
            await context.close();
          }
        });
      }
    });
  }
});

// ============================================================================
// Generate manifest after all screenshots are captured
// ============================================================================

test.describe('Generate Screenshot Manifest', () => {
  test('create manifest.json with screenshot inventory', async () => {
    const manifest: {
      generatedAt: string;
      baseUrl: string;
      stores: {
        apple: { devices: any[]; totalScreenshots: number };
        google: { devices: any[]; totalScreenshots: number };
      };
    } = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      stores: {
        apple: { devices: [], totalScreenshots: 0 },
        google: { devices: [], totalScreenshots: 0 },
      },
    };

    // Catalog Apple screenshots
    for (const device of APPLE_DEVICES) {
      const deviceEntry: any = {
        id: device.id,
        label: device.label,
        required: device.required,
        physicalPixels: device.physicalPixels,
        screenshots: [],
      };

      for (const screen of APP_SCREENS) {
        for (const theme of ['light', 'dark']) {
          const filePath = path.join(
            BASE_OUTPUT_DIR, 'apple', device.id, theme, `${screen.name}.png`
          );
          const exists = fs.existsSync(filePath);
          const stats = exists ? fs.statSync(filePath) : null;

          deviceEntry.screenshots.push({
            screen: screen.name,
            theme,
            description: screen.description,
            path: `apple/${device.id}/${theme}/${screen.name}.png`,
            exists,
            fileSize: stats ? `${(stats.size / 1024).toFixed(0)} KB` : null,
          });

          if (exists) manifest.stores.apple.totalScreenshots++;
        }
      }

      manifest.stores.apple.devices.push(deviceEntry);
    }

    // Catalog Google screenshots
    for (const device of GOOGLE_DEVICES) {
      const deviceEntry: any = {
        id: device.id,
        label: device.label,
        required: device.required,
        physicalPixels: device.physicalPixels,
        screenshots: [],
      };

      for (const screen of APP_SCREENS) {
        for (const theme of ['light', 'dark']) {
          const filePath = path.join(
            BASE_OUTPUT_DIR, 'google', device.id, theme, `${screen.name}.png`
          );
          const exists = fs.existsSync(filePath);
          const stats = exists ? fs.statSync(filePath) : null;

          deviceEntry.screenshots.push({
            screen: screen.name,
            theme,
            description: screen.description,
            path: `google/${device.id}/${theme}/${screen.name}.png`,
            exists,
            fileSize: stats ? `${(stats.size / 1024).toFixed(0)} KB` : null,
          });

          if (exists) manifest.stores.google.totalScreenshots++;
        }
      }

      manifest.stores.google.devices.push(deviceEntry);
    }

    // Write manifest
    const manifestDir = path.join(BASE_OUTPUT_DIR, 'metadata');
    ensureDir(manifestDir);
    fs.writeFileSync(
      path.join(manifestDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Print summary
    console.log('\n========================================');
    console.log('  SCREENSHOT CAPTURE SUMMARY');
    console.log('========================================\n');
    console.log(`Apple App Store: ${manifest.stores.apple.totalScreenshots} screenshots`);
    for (const d of manifest.stores.apple.devices) {
      const count = d.screenshots.filter((s: any) => s.exists).length;
      console.log(`  ${d.required ? '[REQUIRED]' : '[OPTIONAL]'} ${d.label}: ${count} screenshots`);
    }
    console.log(`\nGoogle Play Store: ${manifest.stores.google.totalScreenshots} screenshots`);
    for (const d of manifest.stores.google.devices) {
      const count = d.screenshots.filter((s: any) => s.exists).length;
      console.log(`  ${d.required ? '[REQUIRED]' : '[OPTIONAL]'} ${d.label}: ${count} screenshots`);
    }
    console.log(`\nTotal: ${manifest.stores.apple.totalScreenshots + manifest.stores.google.totalScreenshots} screenshots`);
    console.log(`Output: ${BASE_OUTPUT_DIR}/`);
    console.log('========================================\n');
  });
});
