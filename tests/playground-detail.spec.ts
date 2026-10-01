import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Explore pass 2 WP4: /playgrounds/:slug.
 *
 *  1. Both ld+json blocks are escaped (toJsonLd): a name holding
 *     "</script><script>" stays inside its block and runs nothing, and the
 *     Playground node is @type Playground with @id #place, a locality read
 *     from the row, and no isAccessibleForFree.
 *  2. No "Free", "by families", "editors" or "All ages welcome", on the page
 *     or in the meta description.
 *  3. One facts block: Parent essentials plus one Address block with one
 *     Directions link and a plain line that hours aren't listed. A null age
 *     range renders nothing.
 *  4. "Happening here and nearby" lists an event within two miles.
 *  5. The nearby side query is bounded, explicit, and not rating-ordered
 *     (item 10), and the page renders no "Playground Not Found".
 *
 * The fixture backend does not filter; playgrounds and events are answered
 * here with page.route AFTER installFixtureBackend, which wins the match.
 */

const CORS = { 'access-control-allow-origin': '*' };

const BASE = {
  image_url: null,
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DOWNTOWN = {
  ...BASE,
  id: '31000000-0000-0000-0000-000000000001',
  name: 'Fixture Downtown Playground',
  slug: 'fixture-downtown-playground',
  location: '400 Locust St, Des Moines, IA 50309',
  latitude: 41.5868,
  longitude: -93.625,
  age_range: null,
  amenities: ['Swings'],
  has_shade: false,
  has_restrooms: true,
  surface_type: 'Rubber',
  accessibility_notes: 'Ramp to the main deck.',
  description: 'A playground supplied by tests/playground-detail.spec.ts.',
  is_featured: true,
  rating: 4.5,
};

const NEIGHBOUR = {
  ...BASE,
  id: '31000000-0000-0000-0000-000000000002',
  name: 'Fixture Neighbour Playground',
  location: '100 Court Ave, Des Moines, IA 50309',
  latitude: 41.585,
  longitude: -93.62,
  age_range: '2-5',
  amenities: [],
  has_shade: true,
  has_restrooms: null,
  surface_type: null,
  accessibility_notes: null,
  description: null,
  is_featured: false,
  rating: null,
};

const HOSTILE_NAME = 'Fixture </script><script>window.__pwned=1</script> Playground';

const NEARBY_EVENT = {
  id: '21000000-0000-0000-0000-000000000001',
  title: 'Fixture Story Time in the Park',
  description: 'An event supplied by tests/playground-detail.spec.ts.',
  category: 'Family',
  date: '2027-10-01',
  event_start_utc: '2027-10-01T15:00:00Z',
  start_time: '10:00:00',
  end_time: null,
  location: 'Des Moines',
  venue: 'Fixture Library Lawn',
  city: 'Des Moines',
  state: 'IA',
  address: '1000 Grand Ave',
  image_url: null,
  price: null,
  latitude: 41.587,
  longitude: -93.626,
  slug: 'fixture-story-time',
  is_featured: false,
  status: 'upcoming',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function fulfil(route: Route, rows: unknown[]) {
  const req = route.request();
  if (req.method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-range': `*/${rows.length}` }, body: '' });
  }
  if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      headers: CORS,
      body: JSON.stringify(rows[0] ?? null),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...CORS, 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' },
    body: JSON.stringify(rows),
  });
}

/** The detail row for any slug/id lookup, NEIGHBOUR for the side lists. */
async function installPlayground(page: Page, detail: Record<string, unknown>): Promise<string[]> {
  const seen: string[] = [];
  await page.route('**/rest/v1/playgrounds**', (route) => {
    const url = decodeURIComponent(route.request().url().replace(/\+/g, '%20'));
    seen.push(url);
    if (/[?&](slug|id)=eq\./.test(url)) return fulfil(route, [detail]);
    return fulfil(route, [NEIGHBOUR]);
  });
  await page.route('**/rest/v1/events**', (route) => fulfil(route, [NEARBY_EVENT]));
  return seen;
}

/** The page's own text, without the site header and footer. */
async function pageBodyText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = (document.querySelector('main') ?? document.body).cloneNode(true) as HTMLElement;
    root.querySelectorAll('header, footer, script, style').forEach((el) => el.remove());
    return root.innerText;
  });
}

test.describe('/playgrounds/:slug (explore pass 2 WP4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('ld+json is escaped and describes a Playground from its own row', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, { ...DOWNTOWN, name: HOSTILE_NAME });
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('window.__pwned');

    // The injected script never ran.
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

    await expect
      .poll(async () =>
        page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
          els.map((e) => e.textContent ?? '').filter((t) => t.includes('"Playground"')).length,
        ),
      )
      .toBeGreaterThan(0);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    for (const raw of blocks) {
      expect(raw).not.toMatch(/<\/script/i);
      expect(() => JSON.parse(raw)).not.toThrow();
    }
    const nodes = blocks.map((b) => JSON.parse(b) as Record<string, unknown>);
    const place = nodes.find((n) => n['@type'] === 'Playground');
    expect(place).toBeTruthy();
    expect(place!.name).toBe(HOSTILE_NAME);
    expect(String(place!['@id'])).toMatch(/\/playgrounds\/[^#]+#place$/);
    expect(place).not.toHaveProperty('isAccessibleForFree');
    expect(place).not.toHaveProperty('publicAccess');
    expect((place!.address as Record<string, unknown>).addressLocality).toBe('Des Moines');

    const speakable = nodes.find((n) => n['@type'] === 'WebPage' && 'speakable' in n);
    expect((speakable!.speakable as Record<string, unknown>).cssSelector).toEqual(['h1']);

    // geo.position comes from the row, not a downtown fallback.
    await expect(page.locator('meta[name="geo.position"]')).toHaveAttribute('content', '41.5868;-93.625');
  });

  test('no Free, "by families", editors or "All ages welcome"', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();

    // Featured is the column, shown as that word and nothing more.
    await expect(page.getByText('Featured', { exact: true })).toBeVisible();

    const text = await pageBodyText(page);
    expect(text).not.toMatch(/\bFree\b/);
    expect(text).not.toMatch(/by families/i);
    expect(text).not.toMatch(/editor/i);
    expect(text).not.toMatch(/All ages welcome/i);

    const description = (await page.locator('meta[name="description"]').last().getAttribute('content')) ?? '';
    expect(description).not.toMatch(/by families/i);
    expect(description).not.toMatch(/\bfree\b/i);
    await expect(page.locator('.playground-summary')).toHaveCount(0);
  });

  test('one facts block, one Directions link, no ages row when age_range is null', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');

    const essentials = page.locator('section[data-playground-essentials]');
    await expect(essentials).toContainText('Rubber');
    await expect(essentials).toContainText('Ramp to the main deck.');
    await expect(essentials.locator('dt', { hasText: 'Ages' })).toHaveCount(0);
    await expect(essentials.locator('dt', { hasText: 'Admission' })).toHaveCount(0);

    const address = page.locator('[data-playground-address]');
    await expect(address).toContainText('400 Locust St, Des Moines, IA 50309');
    await expect(address).toContainText("Hours aren't listed");
    await expect(page.getByRole('heading', { name: 'Things To Know' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Playground Details' })).toHaveCount(0);

    // At desktop width the sticky mobile bar is hidden: one visible Directions link.
    await expect(page.getByRole('link', { name: /Directions/ }).filter({ visible: true })).toHaveCount(1);
  });

  test('events within two miles under "Happening here and nearby"', async ({ page }) => {
    await installFixtureBackend(page);
    await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    const rail = page.locator('section[aria-labelledby="attraction-events-heading"]');
    await expect(rail).toBeVisible();
    await expect(rail).toContainText('Fixture Story Time in the Park');
  });

  test('nearby side query is bounded, explicit and not rating-ordered', async ({ page }) => {
    await installFixtureBackend(page);
    const seen = await installPlayground(page, DOWNTOWN);
    await page.goto('/playgrounds/fixture-downtown-playground');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Downtown Playground' })).toBeVisible();

    await expect.poll(() => seen.some((u) => u.includes('longitude=gte.'))).toBe(true);
    const nearby = seen.find((u) => u.includes('longitude=gte.')) ?? '';
    expect(nearby).not.toContain('order=rating');
    expect(nearby).not.toContain('select=*');

    await expect(page.locator('[data-playground-side-card]').first()).toBeVisible();
    await expect(page.getByText('Playground Not Found')).toHaveCount(0);
    await expect(page.getByText(/dawn to dusk/i)).toHaveCount(0);
  });
});
