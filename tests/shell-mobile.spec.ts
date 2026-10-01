import { test, expect, type Page, type Locator } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home plan WP8 - shell defects a phone visitor hits.
 *
 * 1. BackToTop and BottomNav were both z-50 at the bottom of the viewport, and
 *    BottomNav renders after <main>, so it painted over BackToTop's bottom-6
 *    box. The button was in the DOM and untappable. elementFromPoint is the
 *    check, because a visibility assertion passes on a covered element.
 * 2. The mobile sheet rendered two close buttons: shadcn's 16px corner X and
 *    MobileNav's own 40px one. There should be one, at 44px or more.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** True when the topmost element at the centre of `target` is inside it. */
async function isTopmostAtCentre(page: Page, target: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  if (!box) return false;
  const handle = await target.elementHandle();
  if (!handle) return false;
  return page.evaluate(
    ({ el, x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (el === hit || el.contains(hit));
    },
    { el: handle, x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

/**
 * The cookie banner is fixed to the bottom of the viewport at z-[60], so on a
 * first visit it sits over both BackToTop and BottomNav and elementFromPoint
 * lands on its buttons. A stored decision keeps it closed; cookie-consent.spec.ts
 * covers the banner itself.
 */
async function seedConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'cookie-consent',
        JSON.stringify({
          version: '2026-04-13',
          timestamp: new Date().toISOString(),
          essential: true,
          preferences: false,
          analytics: false,
          advertising: false,
        }),
      );
    } catch {
      // Storage blocked: the banner shows and the spec fails loudly.
    }
  });
}

test.describe('Mobile shell (Home WP8)', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page);
  });

  test('BackToTop and the last BottomNav tab are both tappable after scrolling', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // Guarantee enough height to scroll 2000px whatever the fixtures render.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      spacer.setAttribute('data-test-spacer', '');
      document.getElementById('main-content')?.appendChild(spacer);
    });
    await page.evaluate(() => window.scrollTo(0, 2000));

    const backToTop = page.getByRole('button', { name: /scroll to top/i });
    await expect(backToTop).toBeVisible();
    expect(await isTopmostAtCentre(page, backToTop)).toBe(true);

    const bottomNav = page.getByRole('navigation', { name: /bottom navigation/i });
    const lastTab = bottomNav.getByRole('link').last();
    await expect(lastTab).toBeVisible();
    expect(await isTopmostAtCentre(page, lastTab)).toBe(true);

    // Activating it returns to the top and moves focus to the content start.
    await backToTop.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('the mobile menu sheet has exactly one close button, at least 44px', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /open navigation menu/i }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    const closeButtons = sheet.getByRole('button', { name: /^close/i });
    await expect(closeButtons).toHaveCount(1);
    const box = await closeButtons.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
