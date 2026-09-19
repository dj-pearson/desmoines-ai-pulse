#!/usr/bin/env node
/**
 * WEB-PERF-040. The LCP image must not be lazy, and must carry a priority hint.
 *
 * OptimizedImage has supported `priority` (loading="eager" +
 * fetchpriority="high") since it was written and NO caller in the app passed
 * it. SocialEventCard - which renders every event listing on the site - was
 * hardcoded loading="lazy" with no way to opt out. So the largest element on
 * /events, /restaurants, and every SEO landing page was lazily loaded, which
 * is the one thing Chrome's guidance says not to do: the browser will not
 * start that fetch until layout has run.
 *
 * TWO RULES.
 *
 * HEROES: the three detail pages, where the LCP element is unambiguous - one
 * full-bleed image at the top, above everything else.
 *
 * LISTING GRIDS: every hub and SEO landing page whose primary content is a card
 * grid. This used to be excluded on the grounds that "which card is above the
 * fold depends on the viewport, so a hard rule there would be guesswork".
 * WEB-SEO-032 settled it: the first three, which is the first row of the
 * three-column desktop grid and the first card on a phone. Guessing which of
 * three is above the fold costs one wasted eager fetch; guessing wrong the other
 * way costs the LCP on every listing page on the site.
 *
 * It matters more than the attribute suggests on the OptimizedImage paths:
 * that component renders NO <img> at all until its IntersectionObserver fires,
 * so a card grid without `priority` also ships prerendered HTML with no card
 * images in it - which the AI crawlers robots.txt invites, none of which run
 * JavaScript, see as a page of empty cards.
 *
 * NOT LISTED HERE, deliberately: related-content rails on detail pages,
 * dashboard and profile grids, dialog images, and the 48px avatars in
 * BestOfCategory. None of them can be the LCP element, and marking them eager
 * would compete with the image that is.
 *
 * Usage: node scripts/check-lcp-priority.mjs
 */
import { readFileSync } from 'node:fs';

const HEROES = [
  'src/pages/EventDetails.tsx',
  'src/pages/RestaurantDetails.tsx',
  'src/pages/AttractionDetails.tsx',
  // Added 2026-09-19 (WEB-PERF-041 AC4). Both were full-bleed detail heroes
  // this check did not look at: PlaygroundDetails was eager with no
  // fetchpriority hint, and HotelDetails set no loading, no decoding and no
  // hint at all. A list of "the three detail pages" stops being true the
  // moment a fourth detail page ships.
  'src/pages/PlaygroundDetails.tsx',
  'src/pages/HotelDetails.tsx',
];

/**
 * A hero is either a raw <img> carrying the two attributes, or an
 * <OptimizedImage priority>, which sets loading="eager" and
 * fetchpriority="high" itself AND - the part that matters - renders its <img>
 * immediately instead of waiting for the IntersectionObserver. Without
 * `priority` that component ships prerendered HTML with no hero in it, so
 * "uses OptimizedImage" is not on its own good enough here.
 */
function heroProblems(file, text) {
  const out = [];
  const rawAt = text.indexOf('<img');
  const optAt = text.indexOf('<OptimizedImage');
  const usesOptimized = optAt !== -1 && (rawAt === -1 || optAt < rawAt);

  if (usesOptimized) {
    const tag = text.slice(optAt, text.indexOf('/>', optAt) + 2);
    // `priority` (bare) or priority={true}. priority={false} is not priority.
    if (!/\spriority(\s|\/>|=\{true\})/.test(tag)) {
      out.push(`${file}: the hero <OptimizedImage> has no priority, so it renders no <img> until it scrolls into view`);
    }
    return out;
  }

  if (rawAt === -1) {
    out.push(`${file}: no <img> or <OptimizedImage> found - has the hero moved to a component?`);
    return out;
  }
  // The hero is the first <img> in the file; later ones are gallery thumbnails.
  const tag = text.slice(rawAt, text.indexOf('/>', rawAt) + 2);
  if (/loading=["']lazy["']/.test(tag)) {
    out.push(`${file}: the hero image is loading="lazy"`);
  }
  if (!/loading=["']eager["']/.test(tag)) {
    out.push(`${file}: the hero image has no loading="eager"`);
  }
  if (!/fetchPriorityAttr\(\s*["']high["']\s*\)/.test(tag)) {
    out.push(`${file}: the hero image has no fetchpriority="high" hint`);
  }
  return out;
}

const problems = [];
for (const file of HEROES) {
  problems.push(...heroProblems(file, readFileSync(file, 'utf8')));
}

/**
 * Pages whose primary content is a card grid, keyed by the route they serve.
 * Every one of these is prerendered (scripts/prerender-routes.mjs) except
 * /events/near-me, which is geolocated and so cannot be - the LCP argument
 * holds for a live visitor either way.
 */
const LISTING_PAGES = {
  '/events': 'src/pages/EventsPage.tsx',
  '/events/today': 'src/pages/EventsToday.tsx',
  '/events/this-weekend': 'src/pages/EventsThisWeekend.tsx',
  '/events/free': 'src/pages/FreeEvents.tsx',
  '/events/kids': 'src/pages/KidsEvents.tsx',
  '/events/date-night': 'src/pages/DateNightEvents.tsx',
  '/events/<suburb>': 'src/pages/EventsByLocation.tsx',
  '/events/<month>-<year>': 'src/pages/MonthlyEventsPage.tsx',
  '/events/near-me': 'src/pages/EventsNearMe.tsx',
  '/restaurants': 'src/pages/Restaurants.tsx',
  '/restaurants/open-now': 'src/pages/OpenNowRestaurants.tsx',
  '/restaurants/dietary': 'src/pages/DietaryRestaurants.tsx',
  '/attractions': 'src/pages/Attractions.tsx',
  '/playgrounds': 'src/pages/Playgrounds.tsx',
  '/articles': 'src/pages/Articles.tsx',
  '/guides': 'src/pages/GuidesPage.tsx',
  '/breweries': 'src/pages/BreweryTrail.tsx',
  '/itineraries': 'src/pages/Itineraries.tsx',
};

/**
 * The two spellings of "the first three load eagerly". Both are literal on
 * purpose - a helper called isAboveFold(i) would read better and would make
 * this check impossible to write without evaluating the module.
 */
const FIRST_ROW_EAGER = [
  // <Card priority={index < 3} /> - the component forwards it to OptimizedImage.
  /priority=\{\s*\w+\s*(?:===\s*0\s*&&\s*\w+\s*)?<\s*\d+\s*\}/,
  // A raw <img> deciding its own loading attribute.
  /loading=\{[^}]*<\s*\d+\s*\?\s*["']eager["']/,
];

for (const [route, file] of Object.entries(LISTING_PAGES)) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    problems.push(`${file}: listed as the grid for ${route} and not found. Renamed, or the route retired?`);
    continue;
  }
  if (FIRST_ROW_EAGER.some((re) => re.test(text))) continue;
  problems.push(
    `${file} (${route}): no first-row eager treatment. The LCP image on this page is lazy.`,
  );
}

if (problems.length === 0) {
  console.log(
    `OK All ${HEROES.length} detail-page heroes and ${Object.keys(LISTING_PAGES).length} listing grids prioritise their first image.`,
  );
  process.exit(0);
}

console.error('\nX LCP image is not prioritised:\n');
for (const p of problems) console.error(`  ${p}`);
console.error(`
The hero on a detail page is the LCP element. loading="eager" removes the lazy
delay; fetchpriority="high" is what promotes the request past the scripts and
styles the browser found earlier in the document. Both are needed.

Use {...fetchPriorityAttr("high")} from @/lib/fetchPriority on a raw <img>, or
priority on <OptimizedImage>. On OptimizedImage the flag is load-bearing twice
over: it sets both attributes AND renders the <img> without waiting for the
IntersectionObserver, which is what keeps the hero in the prerendered HTML.
`);
process.exit(1);
