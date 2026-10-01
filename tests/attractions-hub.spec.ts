import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore plan WP3: /attractions and /attractions/:slug.
 *
 * 1. A comma in the search box no longer 400s the list into ErrorState. The
 *    attractions route below answers 400 the way PostgREST does when or(...)
 *    does not split into its four clauses, so the old unsanitized query fails
 *    here exactly as it failed in production.
 * 2. ?free=1&kids=1 sends is_free=eq.true and is_kid_friendly=eq.true.
 * 3. The map toggle writes ?view=map, shows a local 600px skeleton while the
 *    chunk loads (the page around it stays up), and never asks unpkg.com for
 *    marker images.
 * 4. The detail page reads attractions.hours JSONB at a fixed clock, shows no
 *    template claims, and never fetches venues?select=*.
 *
 * Explore pass 2 WP3 (the hub half; the detail page is in
 * attraction-detail.spec.ts):
 * 5. No Featured badge or filter, and an old ?featured= link asks for all.
 * 6. Default sort is name; an unknown ?sort= reads as name.
 * 7. ?open=now keeps only what is open at this minute and says out of how many
 *    rows with hours.
 * 8. Each card is an <article> whose title is the link, with Save beside it.
 * 9. The Explore row and "Show on map" are on the page.
 * 10. The map says how many rows have no location.
 * 11. Dark mode passes axe color-contrast.
 *
 * Table overrides are registered AFTER installFixtureBackend, which the
 * fixture documents as the way to win the match.
 */

const ISO = '2026-09-01T12:00:00.000Z';
const NINE_TO_FIVE = { open: '09:00', close: '17:00' };

function attraction(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `31000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `Hub Fixture Attraction ${i}`,
    description: 'An attraction supplied by attractions-hub.spec.ts.',
    type: i % 2 === 0 ? 'Museum' : 'Park',
    location: '100 Fixture St, Des Moines, IA',
    address: null,
    image_url: null,
    rating: 4.25,
    is_featured: false,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.58 + i * 0.001,
    longitude: -93.62,
    website: 'https://example.com/fixture',
    hours_summary: null,
    hours: null,
    is_indoor: i % 2 === 0,
    is_kid_friendly: true,
    is_free: i % 3 === 0,
    is_active: true,
    accessibility_notes: null,
    geo_summary: null,
    created_at: ISO,
    updated_at: ISO,
    ...extra,
  };
}

const HOURS_ROW = attraction(99, {
  name: 'Hours Fixture Museum',
  type: 'Museum',
  is_free: false,
  is_indoor: true,
  hours: {
    mon: NINE_TO_FIVE,
    tue: NINE_TO_FIVE,
    wed: NINE_TO_FIVE,
    thu: NINE_TO_FIVE,
    fri: NINE_TO_FIVE,
    sat: { open: '10:00', close: '16:00' },
    sun: null,
  },
  accessibility_notes: 'Step-free entrance on the north side.',
});

const headers = { 'access-control-allow-origin': '*' };

function fulfilRows(route: Route, rows: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...headers, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

/**
 * The attractions table, with PostgREST's or(...) parse rule: four clauses
 * or a 400. Records every request URL so a spec can assert on the filters.
 */
async function installAttractions(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/attractions**', (route) => {
    const url = new URL(route.request().url());
    seen.push(url.toString());
    const or = url.searchParams.get('or');
    if (or !== null) {
      const inner = or.replace(/^\(/, '').replace(/\)$/, '');
      if (inner.split(',').length !== 4) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ code: 'PGRST100', message: 'failed to parse logic tree' }),
        });
      }
      return fulfilRows(route, []);
    }
    if ((url.searchParams.get('slug') ?? '').includes('hours-fixture-museum')) {
      return fulfilRows(route, [HOURS_ROW]);
    }
    // The detail page's related rails; the hub list.
    if (url.searchParams.has('slug')) return fulfilRows(route, []);
    return fulfilRows(route, Array.from({ length: 6 }, (_, i) => attraction(i)));
  });
  return seen;
}

test.describe('attractions hub (Explore WP3)', () => {
  test('a comma in the search shows results or the empty state, not ErrorState', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installAttractions(page);

    await page.goto('/attractions?q=Ankeny,%20IA');
    await expect(page.getByRole('heading', { name: /No results for/i })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    expect(seen.some((u) => new URL(u).searchParams.has('or'))).toBe(true);
  });

  test('Free and Kid-friendly go to the server as column filters', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installAttractions(page);

    await page.goto('/attractions?free=1&kids=1');
    await expect(page.getByRole('button', { name: 'Free', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Kid-friendly', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(() =>
        seen.some((u) => {
          const p = new URL(u).searchParams;
          return p.get('is_free') === 'eq.true' && p.get('is_kid_friendly') === 'eq.true';
        }),
      )
      .toBe(true);

    // Toggling Indoors adds its own filter and keeps the other two in the URL.
    await page.getByRole('button', { name: 'Indoors', exact: true }).click();
    await expect(page).toHaveURL(/indoor=1/);
    await expect(page).toHaveURL(/free=1/);
    await expect(page).toHaveURL(/kids=1/);
  });

  test('pagination links carry a real href', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/attractions**', (route) =>
      fulfilRows(route, Array.from({ length: 40 }, (_, i) => attraction(i))),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/attractions?free=1');
    const two = page.getByRole('navigation', { name: /pagination/i }).getByRole('link', { name: '2', exact: true });
    await expect(two).toHaveAttribute('href', /page=2/);
    await expect(two).toHaveAttribute('href', /free=1/);
  });

  test('the map toggle shows a local skeleton, syncs ?view=map and never calls unpkg', async ({ page }) => {
    await installFixtureBackend(page);
    await installAttractions(page);
    const unpkg: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('unpkg.com')) unpkg.push(r.url());
    });
    await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 204, body: '' }));
    // Hold the lazy map chunk so the skeleton is observable.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/AttractionsMap[^/]*\.(js|tsx)(\?.*)?$/, async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto('/attractions');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to map view' }).click();

    await expect(page).toHaveURL(/view=map/);
    const skeleton = page.getByRole('status', { name: 'Loading map' });
    await expect(skeleton).toBeVisible();
    const box = await skeleton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(590);
    // The page around the map stayed mounted.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    release();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
    expect(unpkg).toEqual([]);
  });
});

test.describe('attraction detail (Explore WP3)', () => {
  test('hours JSONB gives a status at a fixed clock, and no template claims render', async ({ page }) => {
    // Wednesday 2026-09-23, 10:00 AM in Des Moines.
    await page.clock.setFixedTime(new Date('2026-09-23T15:00:00Z'));
    await installFixtureBackend(page);
    await installAttractions(page);
    const venuesStar: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/\/rest\/v1\/venues\?/.test(u) && /select=\*/.test(decodeURIComponent(u))) venuesStar.push(u);
    });

    await page.goto('/attractions/hours-fixture-museum');
    await expect(page.getByRole('heading', { level: 1, name: 'Hours Fixture Museum' })).toBeVisible();

    await expect(page.getByText('Open until 5 PM')).toBeVisible();
    const today = page.locator('tr[aria-current="date"]');
    await expect(today).toContainText('Wednesday');
    await expect(today).toContainText('9 AM - 5 PM');
    await expect(page.getByText('Step-free entrance on the north side.')).toBeVisible();
    await expect(page.getByText(/Paid admission/)).toBeVisible();

    const body = page.locator('body');
    await expect(body).not.toContainText('Solo Travelers');
    await expect(body).not.toContainText('must-visit');
    await expect(body).not.toContainText('by visitors');
    expect(venuesStar).toEqual([]);
  });

  test('a row with only hours_summary shows that text', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/attractions**', (route) => {
      const url = new URL(route.request().url());
      if ((url.searchParams.get('slug') ?? '').includes('summary-fixture-park')) {
        return fulfilRows(route, [
          attraction(98, { name: 'Summary Fixture Park', hours_summary: 'Dawn to dusk, seasonal' }),
        ]);
      }
      return fulfilRows(route, []);
    });

    await page.goto('/attractions/summary-fixture-park');
    await expect(page.getByRole('heading', { level: 1, name: 'Summary Fixture Park' })).toBeVisible();
    await expect(page.getByText('Dawn to dusk, seasonal').first()).toBeVisible();
  });
});

/** Wednesday 2026-09-23, 10:00 AM in Des Moines. */
const WED_10AM = new Date('2026-09-23T15:00:00Z');

test.describe('attractions hub (explore pass 2 WP3)', () => {
  test('no Featured badge or filter, and ?featured= asks for every row', async ({ page }) => {
    await installFixtureBackend(page);
    const seen: string[] = [];
    await page.route('**/rest/v1/attractions**', (route) => {
      seen.push(route.request().url());
      return fulfilRows(route, [attraction(1, { is_featured: true }), attraction(2)]);
    });

    await page.goto('/attractions?featured=featured');
    await expect(page.getByRole('heading', { level: 3, name: 'Hub Fixture Attraction 1' })).toBeVisible();
    await expect(page.getByText('Featured', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Featured' })).toHaveCount(0);
    expect(seen.some((u) => new URL(u).searchParams.has('is_featured'))).toBe(false);
  });

  test('default and unknown sorts order by name; no star without a review count', async ({ page }) => {
    await installFixtureBackend(page);
    const seen: string[] = [];
    await page.route('**/rest/v1/attractions**', (route) => {
      seen.push(route.request().url());
      return fulfilRows(route, [attraction(1)]);
    });

    await page.goto('/attractions?sort=bogus');
    await expect(page.getByRole('heading', { level: 3, name: 'Hub Fixture Attraction 1' })).toBeVisible();
    const listUrls = seen.map((u) => new URL(u)).filter((u) => u.searchParams.get('is_active') === 'eq.true' && u.searchParams.has('order'));
    expect(listUrls.length).toBeGreaterThan(0);
    expect(listUrls.every((u) => u.searchParams.get('order') === 'name.asc')).toBe(true);
    // The fixture row has rating 4.25; the card doesn't print it.
    await expect(page.locator('article')).not.toContainText('4.3');
    await expect(page.locator('article')).not.toContainText('/5');
  });

  test('Open now keeps what is open at this minute and counts rows with hours', async ({ page }) => {
    await page.clock.setFixedTime(WED_10AM);
    await installFixtureBackend(page);
    const rows = [
      attraction(1, { name: 'Open Fixture Museum', hours: { wed: NINE_TO_FIVE } }),
      attraction(2, { name: 'Closed Fixture Park', hours: { wed: { open: '12:00', close: '17:00' } } }),
      attraction(3, { name: 'Unknown Fixture Garden', hours: null, hours_summary: null }),
    ];
    await page.route('**/rest/v1/attractions**', (route) => fulfilRows(route, rows));

    await page.goto('/attractions');
    await expect(page.getByRole('heading', { level: 3, name: 'Unknown Fixture Garden' })).toBeVisible();
    await page.getByRole('button', { name: 'Open now', exact: true }).click();
    await expect(page).toHaveURL(/open=now/);
    await expect(page.getByRole('button', { name: 'Open now', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-open-now-count]')).toContainText('Open now: 1 of 2 with listed hours');
    await expect(page.locator('[data-open-now-count]')).toContainText('1 more have no hours with us');
    await expect(page.getByRole('heading', { level: 3, name: 'Open Fixture Museum' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Closed Fixture Park' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 3, name: 'Unknown Fixture Garden' })).toHaveCount(0);
    await expect(page.getByText('Outdoor, Kids, Open until 5 PM')).toBeVisible();
    // 44px target.
    const box = await page.getByRole('button', { name: 'Open now', exact: true }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('under the prerender flag: no status text, and ?open=now filters nothing', async ({ page }) => {
    await page.clock.setFixedTime(WED_10AM);
    await page.addInitScript(() => {
      (window as unknown as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ = true;
    });
    await installFixtureBackend(page);
    const rows = [
      attraction(1, { name: 'Open Fixture Museum', hours: { wed: NINE_TO_FIVE } }),
      attraction(2, { name: 'Closed Fixture Park', hours: { wed: { open: '12:00', close: '17:00' } } }),
    ];
    await page.route('**/rest/v1/attractions**', (route) => fulfilRows(route, rows));

    await page.goto('/attractions?open=now');
    await expect(page.getByRole('heading', { level: 3, name: 'Closed Fixture Park' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Open Fixture Museum' })).toBeVisible();
    const main = page.locator('main');
    await expect(main).not.toContainText('Open until');
    await expect(main).not.toContainText('Closes');
    await expect(main).not.toContainText('Closed, opens');
    await expect(page.locator('[data-open-now-count]')).toHaveCount(0);
  });

  test('a card is an article: the title is the link and Save is outside it', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/rest/v1/attractions**', (route) => fulfilRows(route, [attraction(1)]));

    await page.goto('/attractions');
    const card = page.locator('article').filter({ hasText: 'Hub Fixture Attraction 1' });
    await expect(card).toHaveCount(1);
    const link = card.getByRole('link', { name: 'Hub Fixture Attraction 1', exact: true });
    await expect(link).toHaveAttribute('href', '/attractions/hub-fixture-attraction-1');
    await expect(link).not.toHaveAttribute('aria-label', /.*/);
    // No interactive element inside the link.
    await expect(link.locator('button, a')).toHaveCount(0);
    await expect(card.getByRole('button')).not.toHaveCount(0);
  });

  test('the Explore row and Show on map link are on the page', async ({ page }) => {
    await installFixtureBackend(page);
    await installAttractions(page);

    await page.goto('/attractions');
    const row = page.getByRole('navigation', { name: 'Explore Des Moines' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('link', { name: 'Attractions' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Show on map' })).toHaveAttribute('href', '/map?layers=attraction');
  });

  test('the map says how many attractions have no location', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/rest/v1/attractions**', (route) =>
      fulfilRows(route, [attraction(1), attraction(2), attraction(3, { latitude: null, longitude: null })]),
    );

    await page.goto('/attractions?view=map');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('[data-map-missing]')).toHaveText(
      '1 of 3 attractions have no map location, so they are only in the list.',
    );
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  });

  test('dark mode passes axe color-contrast', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('dmi-theme', 'dark');
      } catch {
        /* private mode: the spec then fails on the class check below */
      }
    });
    await installFixtureBackend(page);
    await installAttractions(page);

    await page.goto('/attractions');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { level: 3, name: 'Hub Fixture Attraction 1' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('main')
      .exclude('header')
      .exclude('footer')
      .withRules(['color-contrast'])
      .analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
  });
});
