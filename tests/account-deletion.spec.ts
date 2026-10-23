/**
 * Public account-deletion page (AND-OVH-012).
 *
 * Google Play's Data safety form needs a deletion URL that works without the
 * app and without a session. These pin what that page has to say for the URL
 * to be worth submitting: a heading, an email route for someone who can't sign
 * in, and the warning that a store subscription keeps billing until it is
 * cancelled in the App Store or Google Play.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('/account/delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/account/delete', { waitUntil: 'domcontentloaded' });
  });

  test('renders the heading signed out', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Delete Your Des Moines Insider Account' }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/Delete Your Account/);
  });

  test('gives the privacy address as an email fallback', async ({ page }) => {
    const link = page.locator('main').getByRole('link', { name: 'privacy@desmoinesinsider.com' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'mailto:privacy@desmoinesinsider.com');
  });

  test('says store subscriptions are cancelled in the store', async ({ page }) => {
    await expect(
      page.getByText(/Deleting your account does not cancel a subscription you bought through the App Store or Google Play/),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Google Play subscriptions' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/account/subscriptions',
    );
    await expect(page.getByRole('link', { name: 'App Store subscriptions' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/account/subscriptions',
    );
  });

  test('passes the a11y lane axe tags', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
  });
});

test('the privacy policy links to the deletion page', async ({ page }) => {
  await page.goto('/privacy-policy', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'account deletion page' })).toHaveAttribute('href', '/account/delete');
});
