import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Cookie consent enforcement (WEB-LEGAL-001).
 *
 * PrivacyPolicy.tsx and CookiePolicy.tsx both state that non-essential cookies
 * are off by default and set only after opt-in. This suite asserts the code
 * actually behaves that way, in a real browser, because the defect it guards
 * against was invisible to type-checking and to code review: GA4 was loaded
 * unconditionally from index.html for roughly a year while the first-party
 * tracking hooks were correctly gated, so the codebase read as compliant.
 *
 * Assert on observable behavior (network requests, cookies) rather than on
 * source text. A source-level check would have passed on the broken version.
 */

const CONSENT_KEY = 'cookie-consent';
const CONSENT_VERSION = '2026-04-13'; // keep in step with CookieConsentBanner.tsx

const isGoogleAnalytics = (url: string) =>
  url.includes('googletagmanager.com') || url.includes('google-analytics.com');

function record(analytics: boolean, advertising = false) {
  return JSON.stringify({
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    essential: true,
    preferences: analytics,
    analytics,
    advertising,
  });
}

/** Load the homepage and report every Google Analytics request and cookie seen. */
async function observe(
  context: BrowserContext,
  page: Page,
): Promise<{ requests: string[]; cookies: string[] }> {
  const requests: string[] = [];
  context.on('request', (r) => {
    if (isGoogleAnalytics(r.url())) requests.push(r.url());
  });

  await page.goto('/', { waitUntil: 'load' });
  // The loader defers behind requestIdleCallback with a 4s setTimeout fallback,
  // so a short wait here would pass against a broken build by racing it.
  await page.waitForTimeout(9000);

  const cookies = (await context.cookies())
    .filter((c) => /^(_ga|_gid|_gat)/.test(c.name))
    .map((c) => c.name);

  return { requests, cookies };
}

test.describe('cookie consent gates Google Analytics', () => {
  test('a visitor who has made no choice gets no analytics', async ({ context, page }) => {
    const { requests, cookies } = await observe(context, page);
    expect(requests, 'GA must not load before an explicit opt-in').toEqual([]);
    expect(cookies, 'no GA cookies may be set before an explicit opt-in').toEqual([]);
  });

  test('an explicit rejection blocks analytics', async ({ context, page }) => {
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [CONSENT_KEY, record(false)],
    );
    const { requests, cookies } = await observe(context, page);
    expect(requests, 'GA must not load after the visitor rejected analytics').toEqual([]);
    expect(cookies).toEqual([]);
  });

  test('a Global Privacy Control signal blocks analytics', async ({ context, page }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
    });
    const { requests, cookies } = await observe(context, page);
    expect(requests, 'GPC is a valid opt-out under CPRA/CPA and must be honored').toEqual([]);
    expect(cookies).toEqual([]);
  });

  test('an explicit opt-in allows analytics', async ({ context, page }) => {
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [CONSENT_KEY, record(true)],
    );
    const { requests } = await observe(context, page);
    // Guards the opposite failure: a gate that blocks everything always passes
    // the three tests above while silently breaking analytics entirely.
    expect(requests.length, 'GA should load once analytics is granted').toBeGreaterThan(0);
  });

  test('consent mode defaults to denied before the app hydrates', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });
    const defaults = await page.evaluate(() =>
      (window as unknown as { dataLayer?: IArguments[] }).dataLayer
        ?.map((a) => Array.from(a))
        .find((a) => a[0] === 'consent' && a[1] === 'default'),
    );
    expect(defaults, 'index.html must set Consent Mode defaults inline').toBeTruthy();
    expect((defaults as unknown[])[2]).toMatchObject({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });
});
