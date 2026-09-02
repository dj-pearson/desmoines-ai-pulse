/**
 * Event links resolve, and hotel pages point at routes that exist
 * (WEB-SEO-033, WEB-SEO-034).
 *
 * useEventBySlug matches only DATE-SUFFIXED slugs, so every `/events/<uuid>`
 * link landed on Event Not Found. Nine components and pages built links that
 * way -- venue, team, sports and music hubs, events-near-me, the 404 page, the
 * recently-viewed rail and the recommendations rail -- and none of them failed
 * loudly: a link that 404s looks exactly like a link until it is clicked.
 *
 * Hotel pages built breadcrumbs to /hotels while the routes are /stay, emitted
 * a relative og:image, and had no sitemap generator on either side.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** Everything that links to an event detail page. */
const LINK_SITES = [
  'src/pages/VenueDetail.tsx',
  'src/pages/TeamDetail.tsx',
  'src/pages/SportsHub.tsx',
  'src/pages/MusicHub.tsx',
  'src/pages/EventsNearMe.tsx',
  'src/pages/Enhanced404.tsx',
  'src/components/RecentlyViewed.tsx',
  'src/components/ForYouRail.tsx',
  'src/components/SmartEventCard.tsx',
];

Deno.test('no event link is built from a bare id', async () => {
  // useEventBySlug matches a date-suffixed slug, so an id-based link is a
  // guaranteed Event Not Found.
  for (const rel of LINK_SITES) {
    const src = codeOnly(await read(rel));
    assertFalse(
      /to=\{`\/events\/\$\{\w+\.id\}`\}/.test(src),
      `${rel} still links to an event by id`,
    );
  }
});

Deno.test('every event link goes through the shared slug builder', async () => {
  for (const rel of LINK_SITES) {
    const src = codeOnly(await read(rel));
    assert(
      /createEventSlugWithCentralTime/.test(src),
      `${rel} must build its event links the same way every other surface does`,
    );
    assert(
      /from ['"]@\/lib\/timezone['"]/.test(src),
      `${rel} must import the builder`,
    );
  }
});

Deno.test('the card that gated on a non-existent column links again', async () => {
  // SmartEventCard declared `slug?: string` and gated both its link and its
  // share on it. public.events has no slug column and nothing set the prop, so
  // the card rendered its unlinked branch for every event and refused every
  // share -- neither of which looks like a failure.
  const src = codeOnly(await read('src/components/SmartEventCard.tsx'));
  assert(
    /const eventSlug = event\.slug \|\| createEventSlugWithCentralTime\(event\.title, event\)/.test(src),
    'the slug must be derived, with the prop kept as an override',
  );
  assert(/to=\{`\/events\/\$\{eventSlug\}`\}/.test(src));
  assert(/slug: eventSlug,/.test(src), 'and sharing must use the same value');
});

Deno.test('the slug builder tolerates a null title', async () => {
  // One converted site already guards its title as possibly null, so a crash on
  // a link render was one nullable row away.
  const src = await read('src/lib/timezone.ts');
  assert(/title: string \| null \| undefined/.test(src));
  assert(/const titleSlug = \(title \?\? ""\)/.test(src));
});

Deno.test('the four detail pages carry a canonical after the fetch, not only during it', async () => {
  // RouteCanonical was only in the loading branch, so the canonical existed for
  // a few hundred milliseconds and then vanished. A crawler that executes JS
  // sees the settled DOM.
  for (const [rel, path] of [
    ['src/pages/VenueDetail.tsx', '/music/venues/'],
    ['src/pages/TeamDetail.tsx', '/sports/'],
    ['src/pages/TrailDetail.tsx', '/outdoors/'],
    ['src/pages/ItineraryDetail.tsx', '/itineraries/'],
  ]) {
    const src = codeOnly(await read(rel));
    const count = (src.match(/<RouteCanonical path=/g) || []).length;
    assertEquals(count, 2, `${rel} needs a canonical in both the loading and the loaded branch`);
    assert(src.includes(path), `${rel} must canonicalise its own route`);
  }
});

Deno.test('hotel breadcrumbs point at routes that exist', async () => {
  // They named /hotels and /hotels/<slug>. The routes are /stay and /stay/:slug
  // with no redirect, so Google drops the whole trail -- a BreadcrumbList whose
  // items 404 is not a partial win.
  const src = codeOnly(await read('src/pages/HotelDetails.tsx'));
  assert(/getCanonicalUrl\("\/stay"\)/.test(src));
  assert(/getCanonicalUrl\(`\/stay\/\$\{hotel\.slug\}`\)/.test(src));
  assertFalse(/getCanonicalUrl\("\/hotels"\)/.test(src), '/hotels is not a route');
  assertFalse(/\/hotels\/\$\{/.test(src));

  const app = codeOnly(await read('src/App.tsx'));
  assert(/path="\/stay/.test(app), 'the route this canonicalises to must exist');
});

Deno.test('the hotel og:image is absolute', async () => {
  // A relative og:image resolves against nothing for a social crawler, so the
  // preview simply has no image.
  const src = codeOnly(await read('src/pages/HotelDetails.tsx'));
  assert(/property="og:image" content=\{getCanonicalUrl\(hotel\.image_url \|\| BRAND\.ogImage\)\}/.test(src));
  assertFalse(/content=\{hotel\.image_url \|\| '\/DMI-Logo\.png'\}/.test(src));
});

Deno.test('hotels have a sitemap on both generators', async () => {
  // /stay/:slug had none at all, so not one hotel page was ever submitted.
  const build = await read('scripts/generate-dynamic-sitemaps.ts');
  assert(/async function generateHotelsSitemap/.test(build));
  assert(/generateHotelsSitemap\(\),/.test(build), 'and it must actually run');
  assert(/sitemap-hotels\.xml/.test(build));
  // The slug COLUMN, not a derived one: useHotel resolves /stay/:slug against
  // it, so a derived slug would submit URLs the app 404s.
  const fn = build.slice(build.indexOf('async function generateHotelsSitemap'), build.indexOf('async function generateArticlesSitemap'));
  assert(/\$\{baseUrl\}\/stay\/\$\{hotel\.slug\}/.test(fn));
  assert(/\.eq\('is_active', true\)/.test(fn), 'only rows the detail page renders');

  const edge = await read('supabase/functions/regenerate-sitemaps/index.ts');
  assert(/sitemaps\["sitemap-hotels\.xml"\]/.test(edge));
});

Deno.test('the edge sitemap index no longer shrinks the crawl', async () => {
  // It listed five children while the build produces nine, so every run dropped
  // playgrounds, guides and pSEO out of discovery until the next deploy.
  const edge = await read('supabase/functions/regenerate-sitemaps/index.ts');
  const index = edge.slice(edge.indexOf('sitemaps["sitemap.xml"]'), edge.indexOf('</sitemapindex>'));
  for (const name of [
    'sitemap-static', 'sitemap-events', 'sitemap-restaurants', 'sitemap-attractions',
    'sitemap-playgrounds', 'sitemap-articles', 'sitemap-hotels', 'sitemap-guides', 'sitemap-pseo',
  ]) {
    assert(index.includes(name), `the index must list ${name}`);
  }
});

Deno.test('robots and the prerender list know about hotels', async () => {
  const robots = await read('public/robots.txt');
  assert(robots.includes('sitemap-hotels.xml'));

  const prerender = await read('scripts/prerender.mjs');
  const list = prerender.slice(prerender.indexOf('const ENTITY_SITEMAPS = ['), prerender.indexOf('];', prerender.indexOf('const ENTITY_SITEMAPS = [')));
  assert(list.includes('sitemap-hotels.xml'));
  // The list is a strict priority order and the budget shortfall falls entirely
  // on the tail, so a new family must not be inserted ahead of an existing one.
  assert(
    list.indexOf('sitemap-hotels.xml') > list.indexOf('sitemap-articles.xml'),
    'hotels must not take an existing family\'s allocation',
  );
});
