import { test, expect, type Page, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * Home pass 2, WP5 (docs/page-plans/home-pass2.md): the shell as Home meets it.
 *
 * - The critical CSS in index.html painted every <h1> white, so any page H1
 *   without its own colour class was invisible on a light surface.
 * - / fetched Google Fonts (Inter, which no CSS names) and preloaded a logo
 *   the header doesn't render.
 * - The header had no way into search on a phone; now a 44px link at every
 *   width, and "/" from anywhere that isn't a text field.
 * - The footer promised "AI-powered recommendations" the digest doesn't send.
 * - A guest's Save in the quick view reported through a toast the open modal
 *   made inert. It reports in the dialog now, with a sign-up link that works.
 * - On a phone the consent banner covered half the screen, and the
 *   accessibility button sat on top of "Reject non-essential".
 * - The footer's last line ended up under the bottom nav.
 */

const ISO = '2026-01-01T00:00:00Z';

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

/** WCAG contrast between an element's text colour and the first opaque background behind it. */
async function headingContrast(page: Page): Promise<number> {
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible({ timeout: 30_000 });
  return h1.evaluate((el) => {
    const parse = (c: string): [number, number, number, number] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const ch = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const fg = parse(getComputedStyle(el).color);
    let bg: [number, number, number, number] = [255, 255, 255, 1];
    let hasImage = false;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') hasImage = true;
      const c = parse(style.backgroundColor);
      if (c[3] > 0.5) {
        bg = c;
        break;
      }
    }
    // A hero with a photo or gradient behind white text: the image, not a
    // colour, is the background, and this measure can't see it.
    if (hasImage && fg[0] > 200 && fg[1] > 200 && fg[2] > 200) return 21;
    const a = lum(fg);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

test.describe('Shell pass 2 (Home WP5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedConsent(page);
    await installFixtureBackend(page);
  });

  for (const path of ['/', '/whats-new', '/events/no-such-event-x']) {
    test(`the H1 on ${path} is readable in light mode`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(await headingContrast(page)).toBeGreaterThanOrEqual(3);
    });
  }

  test('/ requests nothing from Google Fonts and no header logo preload', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    expect(requested.filter((u) => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com'))).toEqual([]);
    expect(requested.filter((u) => u.includes('DMI-Logo-Header'))).toEqual([]);
  });

  test('a stored dark theme applies before the app paints', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('dmi-theme', 'dark');
      } catch {
        // ignore
      }
    });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('body');
    const state = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    expect(state.dark).toBe(true);
    expect(state.bg).not.toBe('rgb(255, 255, 255)');
  });

  test('header search is a link at desktop width, and "/" opens search', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // A page with no search box of its own: App's shortcut focuses one when
    // there is one, and the header's takes over when there isn't.
    await page.goto('/whats-new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
    const search = page.locator('header').getByRole('link', { name: 'Search', exact: true });
    await expect(search).toHaveAttribute('href', '/search');
    const box = await search.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('/');
    await expect(page).toHaveURL(/\/search$/);
  });

  test('"/" typed into a field stays in the field', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const email = page.locator('#footer-newsletter-email');
    await email.scrollIntoViewIfNeeded();
    await email.click();
    await page.keyboard.type('a/b');
    await expect(email).toHaveValue('a/b');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the footer promises what the digest sends, and signs up with a return path', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    const footer = page.locator('footer');
    await expect(footer.getByText(/One email a week: what's on in the next 7 days/)).toBeVisible();
    await expect(footer).not.toContainText('AI-powered');
    await expect(footer.getByRole('button', { name: 'Subscribe Free' })).toBeVisible();
    await expect(page.locator('#footer-newsletter-email')).toHaveAttribute('autocomplete', 'email');
    await expect(footer.getByRole('link', { name: 'Sign Up Free' })).toHaveAttribute(
      'href',
      '/auth?mode=signup&redirect=%2Fevents',
    );
  });
});

test.describe('on a 390x844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the header search link is there next to the menu', async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const search = page.locator('header').getByRole('link', { name: 'Search', exact: true });
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('the consent banner leaves the page usable and nothing covers Reject', async ({ page }) => {
    await installFixtureBackend(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const banner = page.getByRole('dialog', { name: 'We value your privacy' });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    const box = await banner.boundingBox();
    expect(box, 'banner has no box').not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(170);

    const reject = banner.getByRole('button', { name: 'Reject non-essential', exact: true });
    const rb = await reject.boundingBox();
    expect(rb).not.toBeNull();
    const onTop = await reject.evaluate(
      (el, p) => {
        const hit = document.elementFromPoint(p.x, p.y);
        return !!hit && (el === hit || el.contains(hit));
      },
      { x: rb!.x + rb!.width / 2, y: rb!.y + rb!.height / 2 },
    );
    expect(onTop).toBe(true);
  });

  test("the footer's last line clears the bottom nav", async ({ page }) => {
    await seedConsent(page);
    await installFixtureBackend(page);
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await page.locator('footer address').waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const address = page.locator('footer address');
    const box = await address.boundingBox();
    expect(box).not.toBeNull();
    const hit = await address.evaluate(
      (el, p) => {
        const top = document.elementFromPoint(p.x, p.y);
        if (!top) return 'nothing';
        if (el === top || el.contains(top)) return 'address';
        return `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 80)}`;
      },
      // The middle of the line: the accessibility button floats over the
      // left edge of every page on purpose, and is not what this measures.
      { x: box!.x + box!.width / 2, y: box!.y + box!.height - 4 },
    );
    expect(hit, `the footer's last line is covered by ${hit}`).toBe('address');
  });
});

/* Quick view: a guest's Save reports inside the dialog. */

function upcoming(days: number, hourUtc: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

// Three a day for the next week. The dashboard shows the coming weekend
// (useHomeWeekEvents), and Home shows each event once, so the rails above it
// claim some; spreading them over seven days keeps a weekend in range on any
// day the spec runs, with rows left over for the dashboard.
const EVENTS = Array.from({ length: 21 }, (_, i) => {
  const start = upcoming(1 + Math.floor(i / 3), 16 + (i % 3) * 2);
  return {
    id: `61000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    title: `Shell Fixture Show ${i + 1}`,
    category: 'Music',
    city: 'Des Moines',
    created_at: ISO,
    updated_at: ISO,
    enhanced_description: 'An event supplied by tests/shell-pass2.spec.ts.',
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
    date: start.toISOString(),
    event_start_utc: start.toISOString(),
    event_start_local: null,
  };
});

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

test('a guest tapping Save in the quick view gets an in-dialog status with a sign-up link', async ({ page }) => {
  await seedConsent(page);
  await installFixtureBackend(page);
  // Only the dashboard's windowed read (date between two bounds) gets rows.
  // Home shows each event once, so rows another rail fetched first would be
  // left out of the dashboard; answering the other reads empty keeps that
  // from depending on which rail loads first.
  await page.route('**/rest/v1/events?*', (route) => {
    const url = decodeURIComponent(route.request().url());
    const windowed = url.includes('date=gte.') && url.includes('date=lte.');
    return json(route, windowed ? EVENTS : []);
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The dashboard's event cards open the quick view (the rails above it link
  // straight to the detail page).
  const dashboard = page.locator('section[aria-labelledby="dashboard-heading"]');
  const link = dashboard
    .locator('li[data-card-kind="event"] a[data-card-link]', { hasText: /Shell Fixture Show \d+/ })
    .first();
  for (let i = 0; i < 40 && !(await dashboard.isVisible()); i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }
  await dashboard.getByRole('tab', { name: 'Events' }).click();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const title = ((await link.textContent()) ?? '').match(/Shell Fixture Show \d+/)?.[0] ?? '';
  expect(title).not.toBe('');
  await link.click();

  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: `Save ${title}` }).click();

  const status = dialog.locator('[data-quick-view-save-status]');
  await expect(status).toBeVisible();
  await expect(status).toContainText('Saved on this device');
  const signUp = status.getByRole('link', { name: /Sign up free/ });
  await expect(signUp).toHaveAttribute('href', /^\/auth\?mode=signup&redirect=%2F/);

  await signUp.click();
  await expect(page).toHaveURL(/\/auth\?mode=signup/);
});
