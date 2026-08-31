#!/usr/bin/env node
/**
 * Offline checks for orderEntityRoutes (SEO-027).
 *
 *   node scripts/__tests__/prerender-order.test.mjs
 *
 * This function decides which pages a JS-less crawler can read, because the
 * entity pass loses its wall-clock race every build: 267 of 1,127 URLs on
 * production 2026-08-31. Everything after the cut ships an SPA shell. So the
 * properties that matter are not "it sorts" but:
 *
 *   TOTALITY      every route out exactly once. A route dropped here is a page
 *                 that is in the sitemap and will never be rendered, and the
 *                 build would not notice - renderPool only reports what it was
 *                 GIVEN against what it finished.
 *   DETERMINISM   two builds of one tree must pick the same pages, or
 *                 check-entity-coverage is measuring network weather rather than
 *                 the site. Ties therefore break on sitemap priority and
 *                 position, never on object key order.
 *   VALUE FIRST   the pages with measured impressions come before the ones
 *                 without.
 *   NO STARVATION the reason the fairness axis exists. Ranking alone gives a
 *                 category whose pages are all NEW (events: 495 of 525 have no
 *                 history) nothing at all, permanently, because never being
 *                 rendered is what keeps it from earning the impressions that
 *                 would get it rendered.
 *
 * Each property is paired with a case that would fail if the implementation
 * cheated in the obvious direction - a test that only proves ranking happens
 * would still pass if fairness were deleted, and vice versa.
 */
import { orderEntityRoutes } from '../prerender-order.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `/${prefix}/${i}`);

console.log('orderEntityRoutes');

// --- totality -------------------------------------------------------------
{
  const bySitemap = [
    ['restaurants', range('restaurants', 40)],
    ['events', range('events', 60)],
    ['guides', range('guides', 3)],
  ];
  const impressions = { '/restaurants/39': 900, '/events/59': 500 };
  const out = orderEntityRoutes(bySitemap, impressions, 4);
  const input = bySitemap.flatMap(([, r]) => r);
  check('emits every route', out.length === input.length, `${out.length} vs ${input.length}`);
  check('emits no route twice', new Set(out).size === out.length);
  check('emits nothing it was not given', out.every((r) => input.includes(r)));
}

// --- determinism ----------------------------------------------------------
{
  const bySitemap = [
    ['restaurants', range('restaurants', 30)],
    ['events', range('events', 30)],
  ];
  // Every route ties at zero, so only the tie-break can order them.
  const a = orderEntityRoutes(bySitemap, {}, 4);
  const b = orderEntityRoutes(bySitemap, {}, 4);
  check('identical input gives identical output', a.join() === b.join());
  check(
    'an all-zero ranking still leads with the first sitemap in priority order',
    a[0] === '/restaurants/0',
    a[0],
  );
}

// --- value first ----------------------------------------------------------
{
  const bySitemap = [['restaurants', range('restaurants', 100)]];
  // /restaurants/99 is LAST alphabetically and first by impressions. This is the
  // real shape: /restaurants/the-pizza-bar was 421st of 477 with 8,089
  // impressions and was never reached.
  const out = orderEntityRoutes(bySitemap, { '/restaurants/99': 8089, '/restaurants/98': 4478 }, 4);
  check('the highest-impression route renders first', out[0] === '/restaurants/99', out[0]);
  check('the second-highest renders second', out[1] === '/restaurants/98', out[1]);
  check(
    'a zero-impression route does not outrank a measured one',
    out.indexOf('/restaurants/99') < out.indexOf('/restaurants/0'),
  );
}

// --- no starvation --------------------------------------------------------
{
  // Every impression sits in one category, which is close to the truth:
  // restaurants hold 87,371 of 93,272 measured impressions.
  const bySitemap = [
    ['restaurants', range('restaurants', 200)],
    ['events', range('events', 200)],
  ];
  const impressions = Object.fromEntries(range('restaurants', 200).map((r, i) => [r, 200 - i]));

  const ranked = orderEntityRoutes(bySitemap, impressions, 0);
  const eventsInRankedHead = ranked.slice(0, 100).filter((r) => r.startsWith('/events/')).length;
  check(
    'ranking ALONE starves the category with no history (this is why fairness exists)',
    eventsInRankedHead === 0,
    `${eventsInRankedHead} event routes in the first 100`,
  );

  const fair = orderEntityRoutes(bySitemap, impressions, 4);
  const eventsInFairHead = fair.slice(0, 100).filter((r) => r.startsWith('/events/')).length;
  check(
    'the fairness interleave gives the starved category a share',
    eventsInFairHead >= 20,
    `${eventsInFairHead} event routes in the first 100`,
  );
  check(
    'and does not give away the head: most of it is still the measured pages',
    fair.slice(0, 100).filter((r) => r.startsWith('/restaurants/')).length >= 70,
  );
  check(
    'fairness draws in sitemap order, so the first event route comes first',
    fair.find((r) => r.startsWith('/events/')) === '/events/0',
    fair.find((r) => r.startsWith('/events/')),
  );
}

// --- degraded inputs ------------------------------------------------------
{
  const bySitemap = [
    ['restaurants', range('restaurants', 10)],
    ['events', range('events', 10)],
  ];
  // An empty ranking is what a missing prerender-priority.json produces. It must
  // still emit everything, and must NOT collapse to one sitemap's alphabet.
  const none = orderEntityRoutes(bySitemap, {}, 4);
  check('an empty ranking still emits every route', new Set(none).size === 20);
  check(
    'an empty ranking still reaches the second sitemap early',
    none.slice(0, 10).some((r) => r.startsWith('/events/')),
    none.slice(0, 10).join(' '),
  );

  check('an empty sitemap list returns nothing', orderEntityRoutes([], {}, 4).length === 0);
  check(
    'a sitemap with no routes is skipped without breaking the round-robin',
    orderEntityRoutes([['guides', []], ['events', range('events', 3)]], {}, 4).length === 3,
  );
  check(
    'impressions for paths that are not in any sitemap are ignored',
    orderEntityRoutes(bySitemap, { '/not/a/route': 99999 }, 4).length === 20,
  );
}

console.log(failures === 0 ? '\nOK prerender-order' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
