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

/*
 * plan-stay WP3 item 2. Every dollar figure in the page body sits inside a
 * fact set that carries its own "Checked against ..." line. A price added
 * anywhere else fails here, which is the point: the taxi range, the named
 * airport bus and the BCycle prices were all in that state.
 */
test('every rendered price sits next to a source and a check date', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByRole('heading', { name: 'Getting Around Des Moines' })).toBeVisible();

  const orphans = await page.locator('[data-page-body="getting-around"]').evaluate((root) => {
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      if (/\$\s?\d/.test(text)) {
        const set = node.parentElement?.closest('[data-fact-set]');
        const line = set?.textContent ?? '';
        if (!set || !/(Checked against|Last checked) /.test(line)) found.push(text.trim());
      }
      node = walker.nextNode();
    }
    return found;
  });
  expect(orphans).toEqual([]);
  // And there is at least one sourced set, so the check above is not vacuous.
  await expect(page.locator('[data-fact-set]').first()).toBeVisible();
});

test('the airport route text is the same in the body and the FAQ, and names no route', async ({ page }) => {
  await page.goto('/getting-around');
  const busText = /DART buses serve the airport\. Check ridedart\.com for the route that runs there now/;
  // Body plus the FAQ answer (the FAQ may be collapsed, so count, not visibility).
  // Polled: the page is lazy-loaded, so a bare count() right after goto can
  // run before the route chunk has rendered anything.
  await expect.poll(() => page.getByText(busText).count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/Route 8/)).toHaveCount(0);
  await expect(page.getByText(/\$18-22/)).toHaveCount(0);
});

test('garages carry directions, not unsourced rates', async ({ page }) => {
  await page.goto('/getting-around');
  const directions = page.getByRole('link', { name: /^Directions to / });
  await expect.poll(() => directions.count()).toBeGreaterThan(0);
  await expect(directions.first()).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=-?\d/);
  await expect(page.getByText(/\$\d+\/hr/)).toHaveCount(0);
});

test('links on to hotels and tonight\'s events', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByRole('link', { name: /Parking for tonight's events/ })).toHaveAttribute('href', '/events/today');
  await expect(page.getByRole('link', { name: /Hotels near Wells Fargo Arena/ })).toHaveAttribute(
    'href',
    '/stay?near=wells-fargo-arena',
  );
});
