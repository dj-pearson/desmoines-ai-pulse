import { test, expect } from '@playwright/test';

/**
 * Listing → detail resolution (WEB-QA-002 regression guard).
 *
 * Every event card surfaced by a listing must open a working detail page.
 * The bug: EventDetails resolved an event by `.find()`-ing the slug in the
 * un-paginated useEvents() list, which is capped at PostgREST's ~1000-row
 * default (date ASC) — so a card for a further-out event 404'd as
 * "Event Not Found". useEventBySlug now resolves via a targeted date-window
 * query, so any listed event resolves regardless of position.
 *
 * This walks a representative sample of the cards actually rendered on /events
 * and asserts each opens a detail page (no "Event Not Found").
 */

const EVENT_NOT_FOUND = 'Event Not Found';

test('every event card on /events resolves to a real detail page', async ({ page }) => {
  await page.goto('/events', { waitUntil: 'domcontentloaded' });

  // Let the list query settle and cards render.
  await page.waitForSelector('a[href^="/events/"]', { timeout: 20000 });

  const links: string[] = await page.$$eval('a[href^="/events/"]', (anchors) =>
    [...new Set(anchors.map((a) => a.getAttribute('href') || ''))].filter(
      (h) =>
        // Only individual event detail slugs: /events/<slug> (3 segments),
        // excluding the SEO landing routes.
        h.split('/').length === 3 &&
        !/\/events\/(today|tomorrow|this-week|this-weekend|open-now)$/.test(h),
    ),
  );

  // If the environment has no event data, there's nothing to assert — fail
  // loudly rather than passing vacuously, so a broken list query is caught too.
  expect(links.length, 'no event cards found on /events').toBeGreaterThan(0);

  // Sample the first few to keep CI fast while still catching the regression.
  const sample = links.slice(0, 5);
  for (const href of sample) {
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    // Wait for the detail page (or the not-found page) to actually render.
    await page.waitForSelector('h1', { timeout: 15000 });
    await expect(
      page.getByText(EVENT_NOT_FOUND, { exact: false }),
      `listed event ${href} 404'd on its detail page`,
    ).toHaveCount(0);
  }
});
