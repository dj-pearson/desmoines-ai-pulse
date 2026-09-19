import { test, expect } from '@playwright/test';

/**
 * WEB-SEC-029. With no VITE_TURNSTILE_SITE_KEY configured, /auth must behave
 * exactly as it did before bot protection was wired in.
 *
 * This is the property the whole shipping order rests on. Turnstile
 * enforcement in Supabase is PROJECT-WIDE: the day it is switched on, every
 * client that does not send a token is rejected, and the shipped iOS and
 * Android binaries do not send one. So the web code lands first and does
 * nothing, and "does nothing" has to be asserted rather than asserted-in-a-
 * comment. A regression here - a widget that renders unconditionally, or a
 * third-party script pulled in on every visit to /auth - would be invisible in
 * review and obvious to a visitor.
 *
 * It runs in the smoke lane because it needs a served build and no database:
 * the form is never submitted.
 */

const TURNSTILE_SCRIPT = 'challenges.cloudflare.com';

test.describe('Turnstile is inert without a site key', () => {
  test('/auth loads no Cloudflare script and renders no widget', async ({ page }) => {
    const thirdParty: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(TURNSTILE_SCRIPT)) thirdParty.push(request.url());
    });

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    expect(thirdParty, 'no Turnstile script should be fetched when unconfigured').toEqual([]);
    await expect(page.locator(`script[src*="${TURNSTILE_SCRIPT}"]`)).toHaveCount(0);
    await expect(page.locator('iframe[src*="challenges.cloudflare.com"]')).toHaveCount(0);
  });

  test('the sign-in form is still usable and submittable', async ({ page }) => {
    await page.goto('/auth');

    // The form itself must be unchanged: same fields, same enabled submit.
    //
    // `.and(input)` rather than `.first()` on the password field: /password/i
    // matches TWO elements on /auth - the input and the show/hide toggle
    // button beside it. `.first()` happened to pick the input because of DOM
    // order and nothing pinned that, so a toggle moved ahead of the field
    // would have left this test filling a button and still passing
    // toBeVisible (WEB-CI-028). Probed 2026-09-19: email resolves to one
    // element, password to two.
    const email = page.getByLabel(/email/i);
    const password = page.getByLabel(/password/i).and(page.locator('input'));
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await email.fill('nobody@example.com');
    await password.fill('not-a-real-password');

    // Enabled means no captcha gate was added in front of submission. The form
    // is deliberately NOT submitted - this lane has no database.
    // One match on /auth today; kept unanchored because the button's label is
    // the thing under test and either wording satisfies it.
    const submit = page.getByRole('button', { name: /sign in|log in/i });
    await expect(submit).toBeEnabled();
  });

  test('no empty landmark is announced on the page', async ({ page }) => {
    await page.goto('/auth');
    // The widget container is aria-hidden AND `empty:hidden`, so an unconfigured
    // build must not leave a bare box in the layout or in the a11y tree.
    const container = page.locator('div[aria-hidden="true"].empty\\:hidden');
    await expect(container).toHaveCount(0);
  });
});
