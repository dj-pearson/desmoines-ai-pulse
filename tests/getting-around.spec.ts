/**
 * Sourced transit facts on /getting-around (WEB-FEAT-023).
 *
 * The page used to open its DART section by telling visitors to catch a free
 * "D-Line" downtown circulator. Checked 2026-09-09: its route page 404s, and
 * neither DART's fares page nor its current bus-routes page mentions D-Line,
 * "circulator" or "free". These pin that we stopped saying it, and that the
 * fares we do publish carry a verification date.
 */
import { test, expect } from '@playwright/test';

test('publishes DART fares with a verification date', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByText('$1.75').first()).toBeVisible();
  await expect(page.getByText('$4', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Checked against DART on/i)).toBeVisible();
});

test('no longer advertises the D-Line', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByText('Getting Around', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/D-Line/i)).toHaveCount(0);
  await expect(page.getByText(/downtown circulator/i)).toHaveCount(0);
});

test('does not quote invented rideshare fares or wait times', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByText(/3-8 minutes/i)).toHaveCount(0);
  await expect(page.getByText(/\$12-18/)).toHaveCount(0);
});
