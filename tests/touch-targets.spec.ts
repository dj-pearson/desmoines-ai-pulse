import { test, expect } from '@playwright/test';

/**
 * WEB-UX-036. Footer links have to be tappable on a phone.
 *
 * Measured at 375px against a production build: 72 of the ~73 interactive
 * elements under 44px on every page were footer links, 16-20px tall in lists
 * with 8px gaps. That is where the legal links live - Privacy, Terms, Cookie
 * Policy, Accessibility, DMCA - which are exactly the ones someone goes hunting
 * for deliberately.
 *
 * Two thresholds, matching the two-tier fix. The primary nav links carry
 * .footer-link and get this project's own 44px standard; the SiteDirectory SEO
 * block carries .footer-link-compact and gets WCAG 2.5.8's 24px AA minimum,
 * because sizing 60-odd crawler-oriented deep links to 44px added a full screen
 * of footer scroll for links almost nobody taps.
 *
 * A runtime check because the sizing is a coarse-pointer media query over
 * computed layout - no source-text check can measure a rendered box.
 */

/**
 * Phone metrics set directly rather than by spreading devices['iPhone 13'] -
 * that preset carries defaultBrowserType: 'webkit', which pulls the spec off
 * this config's chromium project and fails to launch.
 */
test.use({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

/**
 * WCAG 2.5.8 exempts a target "in a sentence or its size is otherwise
 * constrained by the line-height of non-target text". Two footer links qualify:
 * the Privacy Policy link inside the newsletter consent sentence, and the
 * mailto inside the postal address line.
 */
const INLINE_EXEMPT = ['Privacy Policy', 'hello@desmoinesinsider.com'];

for (const route of ['/', '/events', '/contact']) {
  test(`${route} footer links are tappable at 375px`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('footer')).toBeVisible({ timeout: 30_000 });

    const undersized = await page.evaluate((exempt) => {
      const footer = document.querySelector('footer');
      if (!footer) return [{ label: 'NO FOOTER', height: 0, min: 0 }];
      const bad: { label: string; height: number; min: number }[] = [];

      for (const el of footer.querySelectorAll('a[href], button')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const box = el.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        // .tap-area-44 supplies its own 44px hit region via an ::after overlay,
        // which getBoundingClientRect on the element does not include.
        if (el.classList.contains('tap-area-44')) continue;

        const label = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
        if (exempt.some((e) => label.includes(e))) continue;

        const min = el.classList.contains('footer-link-compact') ? 24 : 44;
        if (box.height < min) bad.push({ label: label.slice(0, 40), height: Math.round(box.height), min });
      }
      return bad;
    }, INLINE_EXEMPT);

    expect(
      undersized,
      `footer links below their minimum: ${undersized.map((u) => `"${u.label}" ${u.height}px < ${u.min}px`).join(', ')}`
    ).toEqual([]);
  });
}
