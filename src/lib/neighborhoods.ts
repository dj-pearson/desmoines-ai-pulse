/**
 * The one neighborhood inventory (WEB-SEO-036).
 *
 * FOUR SURFACES USED TO CARRY THEIR OWN LIST AND NO TWO OF THEM AGREED:
 *
 *   prerender-routes.mjs + sitemap-static.xml   downtown, east-village, beaverdale, highland-park
 *   NeighborhoodsPage.tsx (the only links)      east-village, west-des-moines, ankeny, urbandale,
 *                                               johnston, clive, waukee, altoona
 *   NeighborhoodGuide.tsx (the editorial copy)  East Village, West Des Moines, Ankeny, Urbandale,
 *                                               Johnston, Clive, Waukee
 *   NeighborhoodPage.tsx (the actual content)   [] for every slug, always
 *
 * The inventory was exactly inverted: `downtown`, `beaverdale` and `highland-park`
 * were the three URLs submitted to Google AND the three with no editorial entry at
 * all, so `currentNeighborhood` was undefined and a crawler got an h1, a generic
 * promise sentence and three tabs reading Events (0) / Dining (0) / Attractions (0).
 * They were linked from nowhere on the site. Meanwhile the six with real
 * hand-written copy were never prerendered, so a JS-less crawler saw their shell.
 *
 * Everything reads this file now, and scripts/check-neighborhood-inventory.mjs
 * fails the build if the routes or the sitemap drift from it again.
 *
 * WHAT IS DELIBERATELY NOT HERE: the per-neighborhood `eventCount` / `restaurantCount`
 * / `attractionCount` the hub used to render in bold as a trust strip (45, 32, 28...
 * summed to site-wide totals). Those were hand-typed and had never been measured,
 * next to detail pages reporting zero. Counts come from the database via
 * useNeighborhoodContent or they do not appear.
 *
 * ALSO NOT HERE: the `demographics` line each entry carried ("Population 68,723 |
 * Median household income $82,492"). No source exists for any of those figures in
 * this repo. Same class as WEB-BE-053 - a statistic with no provenance is worse
 * than no statistic, and worse still on a page that simultaneously reports no
 * events.
 */

export interface Neighborhood {
  /** URL slug. The route is /neighborhoods/<slug>. */
  slug: string;
  name: string;
  /** One sentence, used on the hub card and as the page's lede. */
  description: string;
  highlights: string[];
  zipCodes: string[];
  keywords: string;
  detailedDescription: string;
  bestFor: string;
  /**
   * Strings matched with ilike against events.city/location/venue and the
   * equivalents on restaurants and attractions. Six of these are CITIES and
   * appear verbatim in those columns; East Village is a district inside Des
   * Moines, so it matches on its landmarks instead.
   */
  matchTerms: string[];
  /** Prerendered and listed in sitemap-static.xml. See the check script. */
  prerender: boolean;
}

export const NEIGHBORHOODS: Neighborhood[] = [
  {
    slug: 'east-village',
    name: 'East Village',
    description:
      "Des Moines' walkable downtown district: independent restaurants, craft breweries and the state's largest farmers market.",
    highlights: ['Court Avenue Entertainment District', 'East Village breweries', 'Downtown Farmers Market'],
    zipCodes: ['50309', '50312'],
    keywords: 'East Village Des Moines, Court Avenue nightlife, downtown Des Moines events',
    detailedDescription:
      "The East Village is Des Moines' cultural and nightlife hub, with eclectic dining, craft breweries and an arts scene " +
      'concentrated in a few walkable blocks. Court Avenue anchors the entertainment district with live music venues, rooftop ' +
      'bars and late-night dining, and the Downtown Farmers Market runs through the summer.',
    bestFor: 'Urban nightlife, craft breweries, cultural events, downtown dining',
    matchTerms: ['East Village', 'Court Avenue', 'Downtown Des Moines'],
    prerender: true,
  },
  {
    slug: 'west-des-moines',
    name: 'West Des Moines',
    description: 'The metro\'s shopping and dining destination, plus the historic Valley Junction district.',
    highlights: ['Jordan Creek Town Center', 'Valley Junction Historic District', 'Raccoon River Park'],
    zipCodes: ['50265', '50266', '50061'],
    keywords: 'West Des Moines events, Jordan Creek shopping, Valley Junction historic district',
    detailedDescription:
      "West Des Moines holds Jordan Creek Town Center, Iowa's largest shopping mall, and the historic Valley Junction " +
      'district, so it spans upscale shopping and independent storefronts in one city. Raccoon River Park adds year-round ' +
      'recreation with trails, playgrounds and natural areas.',
    bestFor: 'Shopping, family dining, historic walking tours',
    matchTerms: ['West Des Moines', 'Valley Junction', 'Jordan Creek'],
    prerender: true,
  },
  {
    slug: 'ankeny',
    name: 'Ankeny',
    description: 'One of Iowa\'s fastest-growing communities, built around trails and community programming.',
    highlights: ['Ankeny Market & Pavilion', 'High Trestle Trail', 'Prairie Trail'],
    zipCodes: ['50023', '50021'],
    keywords: 'Ankeny family events, High Trestle Trail activities, Ankeny community center',
    detailedDescription:
      'Ankeny is one of the metro\'s fastest-growing suburbs, with the High Trestle Trail bridge at its edge and community ' +
      'programming centred on the Ankeny Market & Pavilion. Youth sports, community festivals and educational programming ' +
      'make up most of the calendar.',
    bestFor: 'Family activities, cycling, community events, youth sports',
    matchTerms: ['Ankeny', 'High Trestle Trail', 'Prairie Trail'],
    prerender: true,
  },
  {
    slug: 'urbandale',
    name: 'Urbandale',
    description: 'Suburban parks and trails, anchored by Living History Farms.',
    highlights: ['Living History Farms', 'Walker Johnston Park', 'Urbandale Community Center'],
    zipCodes: ['50322', '50323'],
    keywords: 'Urbandale family activities, Living History Farms events, Urbandale parks',
    detailedDescription:
      'Urbandale combines suburban parks with Living History Farms, one of Iowa\'s larger educational destinations. Walker ' +
      'Johnston Park carries the athletic facilities and the Urbandale Community Center runs the year-round programming.',
    bestFor: 'Historical education, family recreation, community sports',
    matchTerms: ['Urbandale', 'Living History Farms'],
    prerender: true,
  },
  {
    slug: 'johnston',
    name: 'Johnston',
    description: 'Trails and water recreation around Saylorville Lake.',
    highlights: ['Terra Park', 'Johnston Commons', 'Saylorville Lake'],
    zipCodes: ['50131'],
    keywords: 'Johnston Iowa events, Terra Park activities, Saylorville Lake recreation',
    detailedDescription:
      'Johnston\'s outdoor recreation is built around Saylorville Lake and an extensive trail system. Terra Park holds the ' +
      'athletic facilities and Johnston Commons serves as the community\'s gathering point, with water recreation, cycling ' +
      'and nature education making up most of the programming.',
    bestFor: 'Outdoor recreation, water activities, trails, nature programs',
    matchTerms: ['Johnston', 'Saylorville', 'Terra Park'],
    prerender: true,
  },
  {
    slug: 'clive',
    name: 'Clive',
    description: 'Parks, the Greenbelt Trail and one of the metro\'s larger aquatic centers.',
    highlights: ['Clive Aquatic Center', 'Campbell Recreation Area', 'Greenbelt Trail'],
    zipCodes: ['50325'],
    keywords: 'Clive Iowa activities, Campbell Recreation Area, Clive family events',
    detailedDescription:
      'Clive is known for its recreational facilities: the Clive Aquatic Center, Campbell Recreation Area and the Greenbelt ' +
      'Trail running the length of the city. The Clive Community Center hosts most of the year-round programming.',
    bestFor: 'Aquatic recreation, family fitness, trails',
    matchTerms: ['Clive', 'Greenbelt Trail', 'Campbell Recreation'],
    prerender: true,
  },
  {
    slug: 'waukee',
    name: 'Waukee',
    description: 'A fast-growing western suburb with new restaurants and large park facilities.',
    highlights: ['Waukee Family YMCA', 'Centennial Park', 'Triumph Park'],
    zipCodes: ['50263'],
    keywords: 'Waukee Iowa events, Centennial Park activities, Waukee family fun',
    detailedDescription:
      'Waukee is among the metro\'s fastest-growing communities. The Waukee Family YMCA anchors wellness programming, and ' +
      'Centennial Park and Triumph Park carry the recreational calendar, which leans heavily toward youth development and ' +
      'community festivals.',
    bestFor: 'Family programs, youth sports, new restaurants',
    matchTerms: ['Waukee', 'Centennial Park', 'Triumph Park'],
    prerender: true,
  },
  {
    slug: 'altoona',
    name: 'Altoona',
    description: 'Home to Adventureland, Prairie Meadows and the metro\'s largest entertainment venues.',
    highlights: ['Adventureland Park', 'Prairie Meadows', 'Bass Pro Shops'],
    zipCodes: ['50009'],
    keywords: 'Altoona Iowa events, Adventureland, Prairie Meadows',
    detailedDescription:
      'Altoona holds the metro\'s largest entertainment venues: Adventureland Park, the Prairie Meadows racetrack and casino, ' +
      'and the Outlets of Des Moines. Most of what happens here is ticketed and seasonal rather than community programming.',
    bestFor: 'Theme parks, ticketed entertainment, outlet shopping',
    matchTerms: ['Altoona', 'Adventureland', 'Prairie Meadows'],
    prerender: true,
  },
];

/** Slug -> neighborhood. Undefined for any slug not in the inventory. */
export function findNeighborhood(slug: string | undefined): Neighborhood | undefined {
  if (!slug) return undefined;
  return NEIGHBORHOODS.find((n) => n.slug === slug);
}

/** The routes prerender-routes.mjs and sitemap-static.xml must carry, in order. */
export const NEIGHBORHOOD_ROUTES = NEIGHBORHOODS.filter((n) => n.prerender).map(
  (n) => `/neighborhoods/${n.slug}`
);

/**
 * Below this many items across events + restaurants + attractions, the detail
 * page noindexes itself and points at the hub.
 *
 * This is load-bearing rather than tidy. The ilike matching below cannot be
 * verified against production from here (no credentials in this container), so
 * the gate is what guarantees an unverified query cannot submit a thin page to
 * a crawler: if the match finds nothing, the page says so and takes itself out
 * of the index instead of shipping the promise with an empty body. Mirrors the
 * pSEO inventory gate in WEB-SEO-013.
 */
export const NEIGHBORHOOD_MIN_ITEMS = 5;
