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

/*
 * plan-stay-pass2 WP3 item 4. The garage cards named two places that were not
 * garages ("Civic Center Garage" was the theater's address) and cited nothing.
 * With no checked list, the page points at the city and ParkDSM instead.
 */
test('parking points at the city, not an unsourced garage list', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByRole('heading', { name: /Parking/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Directions to / })).toHaveCount(0);
  await expect(page.getByText('Civic Center Garage')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /City of Des Moines parking/ })).toHaveAttribute('href', /dsm\.city/);
  await expect(page.getByText(/\$\d+\/hr/)).toHaveCount(0);
});

test('links on to hotels, venues, tonight\'s events and the planner', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByRole('link', { name: /Parking for tonight's events/ })).toHaveAttribute('href', '/events/today');
  // Current name on the link, old slug in the URL (plan-stay-pass2 WP3 item 5).
  await expect(page.getByRole('link', { name: /Hotels near Casey's Center/ })).toHaveAttribute(
    'href',
    '/stay?near=wells-fargo-arena',
  );
  await expect(page.getByRole('link', { name: /Events at Casey's Center/ })).toHaveAttribute(
    'href',
    '/music/venues/wells-fargo-arena',
  );
  await expect(page.getByRole('link', { name: 'Pick your dates' })).toHaveAttribute('href', '/trip-planner');
  await expect(page.getByText(/Wells Fargo Arena/)).toHaveCount(0);
});

/*
 * plan-stay-pass2 WP3 item 3, the acceptance line: no $, "min" or "mi" figure
 * sits outside a sourced fact set, except distances the page computes and
 * labels "straight line". The typed drive-time table ("Jordan Creek Mall,
 * 15 min, 10.5 mi") and the skywalk's "more than 4 miles" were both in that
 * state.
 */
test('every price, time and distance is sourced or computed', async ({ page }) => {
  await page.goto('/getting-around');
  await expect(page.getByRole('heading', { name: 'Getting Around Des Moines' })).toBeVisible();

  const orphans = await page.locator('[data-page-body="getting-around"]').evaluate((root) => {
    const figure = /\$\s?\d|\d\s*(?:min|mins|minutes|mi|miles)\b/i;
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      if (figure.test(text)) {
        const set = node.parentElement?.closest('[data-fact-set]');
        const sourced = !!set && /(Checked against|Last checked) /.test(set.textContent ?? '');
        // A computed distance says so every time; strip those and look again.
        const rest = text.replace(/\d+(?:\.\d+)? mi straight line/g, '');
        if (!sourced && figure.test(rest)) found.push(text.trim());
      }
      node = walker.nextNode();
    }
    return found;
  });
  expect(orphans).toEqual([]);
  await expect(page.getByText(/more than 4 miles/)).toHaveCount(0);
});

test('the distance table is computed, labelled and has header semantics', async ({ page }) => {
  await page.goto('/getting-around');
  const table = page.locator('table[data-distance-table="straight-line"]');
  await expect(table).toBeVisible();
  await expect(table.locator('caption')).toHaveText(/Straight-line distance from downtown/);
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(2);
  expect(await table.locator('tbody th[scope="row"]').count()).toBeGreaterThan(3);
  await expect(table.locator('tbody td').first()).toHaveText(/^\d+\.\d mi straight line$/);
  await expect(table.getByText(/Drive Time/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Plan a bus trip with DART' })).toHaveAttribute('href', /ridedart\.com/);
});
