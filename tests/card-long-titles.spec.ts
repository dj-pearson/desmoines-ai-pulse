import { test, expect, type Page, type Route } from '@playwright/test';
import {
  fixtureAttractions,
  fixtureEvents,
  fixtureRestaurants,
  installFixtureBackend,
} from './support/fixtureBackend';
import { centralDay, shortDay } from './support/fixtureClock';

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

/**
 * WEB-UX-079. The event card's meta line is time, venue, then district. The
 * district span was flex-shrink-0, so a typical label ("Downtown / Court Ave",
 * which every fixture row falls in) kept its full width and squeezed the venue
 * to "Fi..." at 375px and to zero width at 320px. The venue is the half a
 * reader acts on, so it keeps its width and the district gives way first.
 */
const LONG_VENUE = 'Fierce Mountain Brewing Taproom';

test('/events card keeps the venue readable before the district', async ({ page }) => {
  await installFixtureBackend(page);
  const rows = fixtureEvents().map((r, i) => (i === 1 ? { ...r, venue: LONG_VENUE } : r));
  await page.route('**/rest/v1/events?**', (route) => reply(route, rows));
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/events');
    const venue = page.getByText(LONG_VENUE, { exact: true });
    await expect(venue).toHaveCount(1, { timeout: 30_000 });
    const widths = await venue.evaluate((el) => {
      // The district is the last item on the meta line.
      const last = el.parentElement?.lastElementChild as HTMLElement | null;
      const place = last && last !== el ? last : null;
      return {
        venue: el.getBoundingClientRect().width,
        venueText: (el as HTMLElement).scrollWidth,
        place: place ? place.getBoundingClientRect().width : 0,
        placeText: (place?.textContent ?? '').trim(),
      };
    });
    expect(widths.placeText, 'the fixture row sits in a named district').toMatch(/Downtown \/ Court Ave$/);
    // "Fierce Mountain" is about 105px at text-sm; less reads as a fragment.
    expect(widths.venue, `venue width at ${width}px`).toBeGreaterThanOrEqual(Math.min(100, widths.venueText));
    expect(widths.venue, `venue gets more room than the district at ${width}px`).toBeGreaterThan(widths.place);
  }
});

/**
 * WEB-UX-080. A multi-day run that hasn't started printed its start time and
 * its dates on the meta line ("10:00 AM CT, Sep 22 - Sep 27"), and that lead
 * never shrinks: about 185px at text-sm, leaving the venue roughly 50px at
 * 320px. The dates now sit on their own line under the time, so the venue
 * keeps the room it had for a one-night show.
 *
 * The row is dated from today (centralDay), not with a literal, because the
 * run has to be in the future for the card to print its dates.
 */
test('/events card keeps the venue readable on a multi-day run that has not started', async ({ page }) => {
  await installFixtureBackend(page);
  const startDay = centralDay(3);
  const endDay = centralDay(8);
  const rows = fixtureEvents().map((r, i) =>
    i === 1
      ? {
          ...r,
          venue: LONG_VENUE,
          date: startDay,
          // 10:00 AM in Central, either side of DST: 15:00Z or 16:00Z both
          // land on the start day, which is all the run label reads.
          event_start_utc: `${startDay}T16:00:00Z`,
          start_time: '10:00:00',
          end_date: endDay,
        }
      : r,
  );
  await page.route('**/rest/v1/events?**', (route) => reply(route, rows));
  const runText = `${shortDay(startDay)} - ${shortDay(endDay)}`;
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/events');
    const venue = page.getByText(LONG_VENUE, { exact: true });
    await expect(venue).toHaveCount(1, { timeout: 30_000 });
    // The card still says when the run is.
    const card = venue.locator('xpath=ancestor::div[contains(@class,"p-4")][1]');
    await expect(card).toContainText(runText);
    const width_ = await venue.evaluate((el) => ({
      venue: el.getBoundingClientRect().width,
      venueText: (el as HTMLElement).scrollWidth,
    }));
    expect(width_.venue, `venue width at ${width}px`).toBeGreaterThanOrEqual(Math.min(100, width_.venueText));
  }
});
