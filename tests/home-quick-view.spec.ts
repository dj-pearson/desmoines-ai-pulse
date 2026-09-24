import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WP6 (docs/page-plans/home.md): the Home event quick view.
 *
 * - Time is Des Moines time. The old formatter used the reader's zone, so a
 *   Los Angeles reader saw a 2:00 PM show as 12:00 PM, and it printed the
 *   19:31:58 no-time marker as "7:31 PM". The browser here runs in
 *   America/Los_Angeles on purpose.
 * - At 375x667 the Close control is at least 44px and the actions (View
 *   details, Save, Share) are on screen without scrolling.
 * - Share does not throw when canShare is missing or the clipboard refuses;
 *   the last resort shows the link in a selectable input.
 * - Directions uses the row's coordinates.
 *
 * Not covered: "a signed-in save shows one toast" needs an auth session the
 * fixture backend does not provide.
 */

test.use({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });

const ISO = '2026-01-01T00:00:00Z';

/** A UTC instant `days` ahead at `hourUtc`:00, so the rows are always upcoming. */
function upcoming(days: number, hourUtc: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function centralDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function centralTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

// 19:00Z is 2:00 PM Central in daylight time, 1:00 PM in standard time. The
// expected string is computed the same way, so either season passes.
const TIMED_START = upcoming(2, 19);
const TBD_START = upcoming(3, 0);

function row(i: number, title: string, extra: Record<string, unknown>) {
  return {
    id: `60000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    title,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    updated_at: ISO,
    enhanced_description: 'An event supplied by tests/home-quick-view.spec.ts.',
    original_description: null,
    event_timezone: 'America/Chicago',
    image_url: null,
    is_enhanced: false,
    is_featured: true,
    is_sponsored: false,
    sponsored_until: null,
    latitude: 41.5868,
    longitude: -93.625,
    location: 'Des Moines, IA',
    price: 'Free',
    source_url: 'https://example.com/event',
    venue: 'Fixture Hall',
    writeup_generated_at: null,
    ...extra,
  };
}

const EVENTS = [
  row(0, 'Timed Fixture Show', {
    date: TIMED_START.toISOString(),
    event_start_utc: TIMED_START.toISOString(),
    event_start_local: null,
  }),
  row(1, 'Unscheduled Fixture Show', {
    date: TBD_START.toISOString(),
    event_start_utc: TBD_START.toISOString(),
    // The no-time marker, as the crawlers write it.
    event_start_local: `${TBD_START.toISOString().slice(0, 10)}T19:31:58`,
    time_tbd: true,
  }),
];

async function json(route: Route, rows: unknown[]) {
  if (route.request().method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': `0-${rows.length - 1}/${rows.length}` },
    body: JSON.stringify(rows),
  });
}

/**
 * The cookie banner is a role="dialog" too, and on a phone it sits over the
 * cards. A stored decision keeps it closed; cookie-consent.spec.ts covers it.
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

async function openQuickView(page: Page, title: string) {
  await seedConsent(page);
  await installFixtureBackend(page);
  // Registered after the catch-all, so it wins for events.
  await page.route('**/rest/v1/events?*', (route) => json(route, EVENTS));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const dashboard = page.locator('section[aria-labelledby="dashboard-heading"]');
  const link = dashboard.locator('li[data-card-kind="event"] a[data-card-link]', { hasText: title }).first();
  for (let i = 0; i < 40 && !(await link.isVisible()); i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  // data-testid is stripped by the build (vite.config.ts), so a data-
  // attribute of the component's own marks the quick view.
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-quick-view', '');
  return dialog;
}

test('shows Central time with CT for a reader in Los Angeles', async ({ page }) => {
  const dialog = await openQuickView(page, 'Timed Fixture Show');
  const when = dialog.locator('[data-quick-view-when]');
  await expect(when).toHaveText(`${centralDate(TIMED_START)} at ${centralTime(TIMED_START)} CT`);
});

test('an event with no known time shows the date and no time', async ({ page }) => {
  const dialog = await openQuickView(page, 'Unscheduled Fixture Show');
  const when = dialog.locator('[data-quick-view-when]');
  await expect(when).toHaveText(centralDate(TBD_START));
  await expect(when).not.toContainText('7:31');
  await expect(when).not.toContainText('CT');
});

test('venue and price read clearly: Free badge, Event website, Directions from coordinates', async ({ page }) => {
  const dialog = await openQuickView(page, 'Timed Fixture Show');
  await expect(dialog.getByText('Free', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Event website' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Directions' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=41.5868,-93.625',
  );
});

test.describe('on a 375x667 phone', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Close is at least 44px and the actions are visible without scrolling', async ({ page }) => {
    const dialog = await openQuickView(page, 'Timed Fixture Show');

    const close = dialog.getByRole('button', { name: 'Close' });
    const box = await close.boundingBox();
    expect(box, 'Close has no box').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    for (const control of [
      dialog.getByRole('link', { name: /View details/ }),
      dialog.getByRole('button', { name: /Save|favorites/ }),
      dialog.getByRole('button', { name: 'Share' }),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
  });
});

test('Share without canShare calls navigator.share with the date and venue', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __shareCalls: unknown[] }).__shareCalls = calls;
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (data: unknown) => {
        calls.push(data);
      },
      configurable: true,
    });
  });
  const dialog = await openQuickView(page, 'Timed Fixture Show');
  await dialog.getByRole('button', { name: 'Share' }).click();

  const calls = await page.waitForFunction(
    () => (window as unknown as { __shareCalls: Array<{ text: string; url: string }> }).__shareCalls,
  );
  const shared = (await calls.jsonValue()) as Array<{ text: string; url: string }>;
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toContain('Fixture Hall');
  expect(shared[0].text).toContain(centralDate(TIMED_START));
  expect(shared[0].url).toContain('/events/');
});

test('Share with no Web Share and a refusing clipboard shows the link to copy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const dialog = await openQuickView(page, 'Timed Fixture Show');
  await dialog.getByRole('button', { name: 'Share' }).click();

  const input = dialog.getByRole('textbox', { name: 'Copy this link to share' });
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(/\/events\//);
  expect(errors).toEqual([]);
});
