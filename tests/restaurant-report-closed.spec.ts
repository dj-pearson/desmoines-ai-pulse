/**
 * The Report closed control on a restaurant page (WEB-FEAT-102).
 *
 * Signed out, on tests/support/fixtureBackend.ts with the detail read and the
 * report RPC overridden. Pins:
 *   - the control works signed out and sends exactly one report_restaurant_closed
 *     call with the restaurant's id and the trimmed note;
 *   - the confirmation says the report was received and the listing was NOT
 *     changed;
 *   - a server refusal (the per-caller limit) is shown, and no confirmation;
 *   - a place closed for good has no control (counter-assertion for the first
 *     test: the control is not simply rendered everywhere).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

const ROW = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Fixture Noodle Bar',
  slug: 'fixture-noodle-bar',
  phone: null,
  website: null,
  location: '500 Walnut St, Des Moines, IA 50309',
  city: 'Des Moines',
  cuisine: 'Noodles',
  description: 'Noodles downtown.',
  image_url: null,
  latitude: 41.58,
  longitude: -93.62,
  rating: null,
  price_range: null,
  opening: null,
  status: 'open',
  business_status: 'OPERATIONAL',
  is_merged: false,
  merged_into: null,
  updated_at: '2026-09-30T00:00:00Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

async function setup(page: Page, row: Record<string, unknown>, rpc: (route: Route) => Promise<void>) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/restaurants*', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes(`slug=eq.${row.slug}`) || url.includes(`id=eq.${row.id}`)) return json(route, [row]);
    return json(route, []);
  });
  await page.route('**/rest/v1/rpc/report_restaurant_closed', rpc);
}

test.describe('report a closed restaurant', () => {
  test('signed out: sends one report and says the listing was not changed', async ({ page }) => {
    const bodies: unknown[] = [];
    await setup(page, ROW, async (route) => {
      bodies.push(route.request().postDataJSON());
      await json(route, { received: true });
    });
    await page.goto(`/restaurants/${ROW.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: ROW.name })).toBeVisible();

    await page.getByRole('button', { name: /has this place closed/i }).click();
    await page.getByLabel(/what did you see/i).fill('  Sign on the door  ');
    await page.getByRole('button', { name: 'Send report' }).click();

    // data-testid is stripped from production builds, so read the status role.
    const sent = page.getByRole('status').filter({ hasText: 'We received your report' });
    await expect(sent).toBeVisible();
    await expect(sent).toContainText("hasn't been changed");
    expect(bodies).toEqual([{ p_restaurant_id: ROW.id, p_note: 'Sign on the door' }]);
  });

  test('a refusal from the server is shown and nothing is confirmed', async ({ page }) => {
    await setup(page, ROW, (route) =>
      json(route, { code: '54000', message: 'You already reported this restaurant today', details: null, hint: null }, 400),
    );
    await page.goto(`/restaurants/${ROW.slug}`);
    await page.getByRole('button', { name: /has this place closed/i }).click();
    await page.getByRole('button', { name: 'Send report' }).click();
    const form = page.getByRole('form', { name: /report fixture noodle bar as closed/i });
    await expect(form.getByRole('alert')).toContainText('already reported');
    await expect(page.getByText('We received your report')).toHaveCount(0);
  });

  test('a place closed for good has no report control', async ({ page }) => {
    await setup(page, { ...ROW, status: 'closed', business_status: 'CLOSED_PERMANENTLY' }, (route) =>
      json(route, { received: true }),
    );
    await page.goto(`/restaurants/${ROW.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: ROW.name })).toBeVisible();
    await expect(page.getByRole('button', { name: /has this place closed/i })).toHaveCount(0);
  });
});
