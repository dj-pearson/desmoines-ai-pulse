import { test, expect, type Page, type Route } from '@playwright/test';
import {
  fixtureAttractions,
  fixtureEvents,
  fixtureRestaurants,
  installFixtureBackend,
} from './support/fixtureBackend';

/**
 * WEB-UX-078. Card titles are line-clamped, and a clamp sets
 * overflow:hidden. A scraped title with no spaces could not wrap, so it ran
 * past the card edge and was cut mid-letter with no ellipsis: on /events at
 * 375px the SocialEventCard title box was 311px wide and its text 580px. The
 * page itself did not scroll sideways (the card clips it), which is why the
 * width guards in mobile-responsive and events-landings never saw it.
 *
 * The fix is one rule in src/index.css that lets any line-clamp-* element
 * break a long token. This checks the three list cards a reader meets first.
 */
const LONG_TOKEN = 'WinterlightsFestivalAtTheDesMoinesBotanicalGardenFamilyNight';

function reply(route: Route, rows: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'content-range': `0-${rows.length - 1}/${rows.length}`,
      'access-control-expose-headers': 'content-range',
    },
    // A count-only read is a HEAD request and must not be given a body.
    body: route.request().method() === 'HEAD' ? '' : JSON.stringify(rows),
  });
}

/** The clamped title box holding the long-token link, measured. */
async function titleOverflow(page: Page) {
  // A page can name the same row in more than one place (a rail and the
  // list); the card title is the link inside a line-clamp box.
  const links = page.getByRole('link', { name: new RegExp(LONG_TOKEN) });
  await expect(links.first()).toBeAttached({ timeout: 30_000 });
  return links.evaluateAll((all) => {
    for (const a of all) {
      let box: HTMLElement | null = a as HTMLElement;
      while (box && !/line-clamp-/.test(box.className)) box = box.parentElement;
      if (box) return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
    }
    return null;
  });
}

const CASES: { path: string; install: (page: Page) => Promise<void> }[] = [
  {
    path: '/events',
    install: async (page) => {
      const rows = fixtureEvents().map((r, i) => (i === 1 ? { ...r, title: `${LONG_TOKEN} 2026` } : r));
      await page.route('**/rest/v1/events?**', (route) => reply(route, rows));
    },
  },
  {
    path: '/restaurants',
    install: async (page) => {
      const rows = fixtureRestaurants().map((r, i) => (i === 1 ? { ...r, name: `${LONG_TOKEN} Grill` } : r));
      await page.route('**/rest/v1/restaurants?**', (route) => reply(route, rows));
      // /restaurants lists through this RPC, and its rows are wrapped.
      await page.route('**/rest/v1/rpc/get_rotated_restaurants', (route) =>
        reply(
          route,
          rows.map((r) => ({ restaurant_data: r, total_count: rows.length })),
        ),
      );
    },
  },
  {
    path: '/attractions',
    install: async (page) => {
      const rows = fixtureAttractions().map((r, i) => (i === 1 ? { ...r, name: `${LONG_TOKEN} Museum` } : r));
      await page.route('**/rest/v1/attractions?**', (route) => reply(route, rows));
    },
  },
];

test.describe('a card title with one long word wraps instead of being clipped', () => {
  for (const { path, install } of CASES) {
    test(`${path} at 320 and 375px`, async ({ page }) => {
      await installFixtureBackend(page);
      await install(page);
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const box = await titleOverflow(page);
        expect(box, `${path}: the long title sits in a line-clamp box`).not.toBeNull();
        expect(box!.scrollWidth, `${path} title text width at ${width}px`).toBeLessThanOrEqual(box!.clientWidth);
      }
    });
  }
});
