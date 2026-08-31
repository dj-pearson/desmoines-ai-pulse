#!/usr/bin/env node
/**
 * Generates the keyword seed lists used for search-volume research.
 *
 *   docs/seo/keyword-research/keyword-seed-master.csv  full metadata, one row per keyword
 *   docs/seo/keyword-research/keyword-upload-list.csv  single column, upload to a volume tool
 *
 * Selection principle: every term here is one where catchdesmoines.com is structurally
 * weak, not merely outranked. The CVB wins city-level head terms on domain authority
 * (docs/seo-plan-2026-08-28.md section 3). It is weak where the answer needs data it does
 * not hold (hours, menus, per-venue logistics), freshness it does not maintain, or
 * geography and audience outside its brief (suburbs, playgrounds, parents).
 *
 * Run: node scripts/generate-keyword-seeds.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'seo', 'keyword-research');

// ---------------------------------------------------------------- route inventory

const liveRoutes = new Set(
  (readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8').match(/path="([^"]*)"/g) || [])
    .map((m) => m.slice(6, -1))
);

const pseoSlugPath = join(ROOT, 'scripts', 'pseo-slugs.txt');
const pseoSlugs = new Set(
  existsSync(pseoSlugPath)
    ? readFileSync(pseoSlugPath, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : []
);

// Dynamic route prefixes that resolve at runtime but have no guaranteed content behind them.
const DYNAMIC_PREFIXES = [
  '/things-to-do/', '/restaurants/', '/events/', '/attractions/', '/playgrounds/',
  '/outdoors/', '/sports/', '/stay/', '/guides/', '/articles/', '/neighborhoods/',
  '/guide/', '/music/venues/', '/itineraries/', '/best-of/', '/nightlife/',
];

function routeStatus(route) {
  if (!route) return 'needs-build';
  if (liveRoutes.has(route)) return 'live';
  if (pseoSlugs.has(route)) return 'pseo-slug';
  if (DYNAMIC_PREFIXES.some((p) => route.startsWith(p))) return 'route-exists-no-content';
  return 'needs-build';
}

// ---------------------------------------------------------------- row collection

const rows = [];
const seen = new Set();

function add(keyword, meta) {
  const k = keyword.toLowerCase().replace(/\s+/g, ' ').trim();
  if (seen.has(k)) return;
  seen.add(k);
  rows.push({
    keyword: k,
    cluster: meta.cluster,
    subcluster: meta.subcluster || '',
    intent: meta.intent,
    seasonality: meta.seasonality || 'evergreen',
    target_route: meta.route || '',
    route_status: routeStatus(meta.route),
    catchdm_gap: meta.gap,
    priority: String(meta.priority),
    notes: meta.notes || '',
  });
}

const each = (list, fn) => list.forEach(fn);

// ---------------------------------------------------------------- 1. suburbs
// The CVB markets "Greater Des Moines" as a single destination. It has no per-suburb
// depth, and a suburb resident searching their own town is a different audience from
// the visitor the CVB is funded to serve.

const SUBURBS = [
  ['Ankeny', 'ankeny'], ['West Des Moines', 'west-des-moines'], ['Urbandale', 'urbandale'],
  ['Waukee', 'waukee'], ['Johnston', 'johnston'], ['Clive', 'clive'], ['Altoona', 'altoona'],
  ['Grimes', 'grimes'], ['Norwalk', 'norwalk'], ['Pleasant Hill', 'pleasant-hill'],
  ['Bondurant', 'bondurant'], ['Indianola', 'indianola'], ['Windsor Heights', 'windsor-heights'],
  ['Adel', 'adel'], ['Polk City', 'polk-city'],
];

each(SUBURBS, ([name, slug]) => {
  const n = name.toLowerCase();
  const base = { cluster: 'Suburbs', subcluster: name, gap: 'suburb-out-of-cvb-scope', priority: 1 };
  add('things to do in ' + n + ' iowa', { ...base, intent: 'discovery', route: '/things-to-do/' + slug });
  add('restaurants in ' + n + ' iowa', { ...base, intent: 'discovery', route: '/restaurants/' + slug });
  add('best restaurants in ' + n, { ...base, intent: 'discovery', route: '/restaurants/' + slug });
  add(n + ' iowa events', { ...base, intent: 'discovery', route: '/events/' + slug, seasonality: 'recurring' });
  add('breakfast in ' + n + ' iowa', { ...base, intent: 'discovery', route: '/restaurants/' + slug, priority: 2 });
  add('parks in ' + n + ' iowa', { ...base, intent: 'discovery', route: '/playgrounds', priority: 2 });
});

// ---------------------------------------------------------------- 2. neighborhoods

const HOODS = [
  ['East Village', 'east-village'], ['Downtown', 'downtown'], ['Court Avenue', 'court-avenue'],
  ['Valley Junction', 'valley-junction'], ['Beaverdale', 'beaverdale'], ['Sherman Hill', 'sherman-hill'],
  ['Drake', 'drake'], ['Ingersoll', 'ingersoll'], ['Highland Park', 'highland-park'],
  ['Merle Hay', 'merle-hay'], ['Grays Lake', 'grays-lake'],
];

each(HOODS, ([name, slug]) => {
  const n = name.toLowerCase();
  const base = { cluster: 'Neighborhoods', subcluster: name, gap: 'cvb-has-no-neighborhood-pages', priority: 1 };
  add('things to do in ' + n + ' des moines', { ...base, intent: 'discovery', route: '/things-to-do/' + slug });
  add(n + ' des moines restaurants', { ...base, intent: 'discovery', route: '/restaurants/' + slug });
  add(n + ' des moines bars', { ...base, intent: 'discovery', route: '/nightlife/' + slug, priority: 2 });
});
add('best neighborhoods in des moines', {
  cluster: 'Neighborhoods', intent: 'research', route: '/neighborhoods',
  gap: 'cvb-has-no-neighborhood-pages', priority: 1,
});
add('where to stay in des moines neighborhood', {
  cluster: 'Neighborhoods', intent: 'research', route: '/neighborhoods',
  gap: 'cvb-has-no-neighborhood-pages', priority: 2,
});

// ---------------------------------------------------------------- 3. time-qualified
// Freshness the CVB does not maintain at page level. These pages earn traffic every
// week indefinitely if they are genuinely current, and nothing if they are not.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

each(MONTHS, (m) => {
  const base = {
    cluster: 'Time-qualified', subcluster: m, gap: 'requires-freshness',
    intent: 'discovery', seasonality: 'monthly',
  };
  add('des moines events ' + m + ' 2026', { ...base, route: '/events/' + m, priority: 1 });
  add('things to do in des moines in ' + m, { ...base, route: '/things-to-do/' + m, priority: 2 });
});

const NOW_TERMS = [
  ['des moines events tonight', '/events/today', 1],
  ['concerts in des moines tonight', '/music', 1],
  ['live music des moines tonight', '/music', 1],
  ['whats happening in des moines today', '/events/today', 1],
  ['des moines events next weekend', '/events/this-weekend', 1],
  ['free things to do in des moines this weekend', '/events/free', 1],
  ['things to do in des moines this weekend with kids', '/events/kids', 1],
  ['des moines farmers market hours', '/events/this-weekend', 2],
  ['des moines events next week', '/events', 2],
  ['what to do in des moines tomorrow', '/events/today', 2],
];
each(NOW_TERMS, ([kw, route, priority]) => add(kw, {
  cluster: 'Time-qualified', subcluster: 'now', intent: 'discovery', seasonality: 'recurring',
  route, gap: 'requires-freshness', priority,
}));

// ---------------------------------------------------------------- 4. family and kids
// Our strongest module by position (playgrounds, several pages at 6-7) and the one the
// CVB covers least. Parents here are residents, not visitors.

const FAMILY = [
  ['best playgrounds in des moines', '/playgrounds', 1],
  ['splash pads des moines', '/playgrounds', 1],
  ['indoor playground des moines', '/playgrounds', 1],
  ['indoor activities for kids des moines', '/things-to-do/families', 1],
  ['free things to do with kids in des moines', '/things-to-do/families', 1],
  ['rainy day activities des moines kids', '/things-to-do/families', 1],
  ['toddler activities des moines', '/things-to-do/families', 1],
  ['birthday party places des moines', '/things-to-do/families', 2],
  ['sledding hills des moines', '/outdoors', 2],
  ['best parks in west des moines', '/playgrounds', 1],
  ['best parks in ankeny', '/playgrounds', 1],
  ['kid friendly restaurants des moines', '/restaurants/families', 1],
  ['trampoline park des moines', '/things-to-do/families', 2],
  ['water park near des moines', '/things-to-do/families', 2],
  ['des moines pools open', '/outdoors', 2],
  ['summer camps des moines', '/things-to-do/families', 3],
  ['things to do in des moines with a baby', '/things-to-do/families', 2],
  ['des moines library story time', '/events/kids', 3],
  ['accessible playgrounds des moines', '/playgrounds', 2],
  ['playgrounds with shade des moines', '/playgrounds', 2],
];
each(FAMILY, ([kw, route, priority]) => add(kw, {
  cluster: 'Family', intent: 'discovery', route, gap: 'cvb-targets-visitors-not-parents', priority,
}));

// ---------------------------------------------------------------- 5. restaurant practicals
// Answerable only from structured data we hold (hours, menus, attributes) and the CVB
// does not. Highest-confidence cluster in the list.

const REST_PRACTICAL = [
  ['restaurants open now des moines', '/restaurants/open-now', 1],
  ['restaurants open late des moines', '/restaurants/open-now', 1],
  ['des moines restaurants open on monday', '/restaurants/open-now', 1],
  ['des moines restaurants open sunday', '/restaurants/open-now', 1],
  ['24 hour restaurants des moines', '/restaurants/open-now', 2],
  ['best patio restaurants des moines', '/restaurants', 1],
  ['rooftop bars des moines', '/nightlife/downtown', 1],
  ['happy hour des moines', '/restaurants', 1],
  ['dog friendly patios des moines', '/restaurants', 1],
  ['restaurants with private rooms des moines', '/restaurants', 2],
  ['restaurants that take reservations des moines', '/restaurants', 2],
  ['des moines restaurants open christmas day', '/restaurants/open-now', 2],
  ['des moines restaurants open thanksgiving', '/restaurants/open-now', 2],
];
each(REST_PRACTICAL, ([kw, route, priority]) => add(kw, {
  cluster: 'Restaurant-practical', intent: 'logistics', route,
  gap: 'needs-hours-data-cvb-lacks', priority,
}));

const CUISINES = ['pizza', 'tacos', 'sushi', 'burger', 'steakhouse', 'bbq', 'mexican', 'italian',
  'thai', 'vietnamese', 'indian', 'korean', 'chinese', 'seafood', 'fried chicken', 'sandwiches',
  'ramen', 'ethiopian', 'breakfast', 'brunch', 'ice cream', 'coffee shops', 'bakery', 'donuts',
  'food trucks'];
each(CUISINES, (c) => add('best ' + c + ' in des moines', {
  cluster: 'Restaurant-cuisine', subcluster: c, intent: 'discovery', route: '/restaurants',
  gap: 'cvb-lists-does-not-rank', priority: 2,
}));

const DIETARY = ['gluten free', 'vegan', 'vegetarian', 'halal', 'keto friendly', 'dairy free'];
each(DIETARY, (d) => add(d + ' restaurants des moines', {
  cluster: 'Restaurant-dietary', subcluster: d, intent: 'discovery', route: '/restaurants/dietary',
  gap: 'needs-attribute-data-cvb-lacks', priority: 1,
}));

const REST_OCCASION = [
  ['date night restaurants des moines', '/restaurants/date-night', 1],
  ['romantic restaurants des moines', '/restaurants/date-night', 2],
  ['cheap eats des moines', '/restaurants/budget', 2],
  ['new restaurants des moines 2026', '/restaurants', 1],
  ['best new restaurants des moines', '/restaurants', 1],
  ['restaurants for large groups des moines', '/restaurants', 3],
];
each(REST_OCCASION, ([kw, route, priority]) => add(kw, {
  cluster: 'Restaurant-occasion', intent: 'discovery', route, gap: 'cvb-lists-does-not-rank', priority,
}));

// ---------------------------------------------------------------- 6. venue logistics
// Nobody owns "where do I park for this". The venue's own site buries it, the CVB does
// not cover it, and the intent is unambiguous.

const VENUES = [
  ['Wells Fargo Arena', 'wells-fargo-arena'],
  ['Iowa Events Center', 'iowa-events-center'],
  ['Des Moines Civic Center', 'des-moines-civic-center'],
  ['Hoyt Sherman Place', 'hoyt-sherman-place'],
  ['Val Air Ballroom', 'val-air-ballroom'],
  ['xBk Live', 'xbk-live'],
  ['Lauridsen Amphitheater', 'lauridsen-amphitheater'],
  ['Vibrant Music Hall', 'vibrant-music-hall'],
  ["Wooly's", 'woolys'],
  ['Principal Park', 'principal-park'],
];
each(VENUES, ([name, slug]) => {
  const n = name.toLowerCase();
  const base = { cluster: 'Venue-logistics', subcluster: name, gap: 'no-one-answers-logistics' };
  add(n + ' parking', { ...base, intent: 'logistics', route: '/music/venues/' + slug, priority: 1 });
  add('restaurants near ' + n, { ...base, intent: 'logistics', route: '/music/venues/' + slug, priority: 1 });
  add(n + ' schedule', { ...base, intent: 'discovery', route: '/music/venues/' + slug, priority: 2, seasonality: 'recurring' });
  add('hotels near ' + n, { ...base, intent: 'transactional', route: '/stay', priority: 2 });
});

// ---------------------------------------------------------------- 7. seasonal editorial
// Articles already rank here (the patio guide, the pumpkin patch guide). This is the
// proven format on this domain, applied across the rest of the calendar.

const SEASONAL = [
  ['pumpkin patches near des moines', 'fall', 1],
  ['apple orchards near des moines', 'fall', 1],
  ['corn maze des moines', 'fall', 1],
  ['haunted houses des moines', 'fall', 1],
  ['beggars night des moines 2026', 'fall', 1],
  ['trick or treat times des moines', 'fall', 1],
  ['fall festivals near des moines', 'fall', 2],
  ['fall colors near des moines', 'fall', 2],
  ['christmas lights des moines', 'winter', 1],
  ['jolly holiday lights des moines', 'winter', 1],
  ['holiday events des moines', 'winter', 1],
  ['ice skating des moines', 'winter', 1],
  ['santa photos des moines', 'winter', 2],
  ['new years eve des moines', 'winter', 2],
  ['easter egg hunts des moines', 'spring', 2],
  ['tulip time pella from des moines', 'spring', 2],
  ['farmers markets des moines', 'summer', 1],
  ['fourth of july fireworks des moines', 'summer', 1],
  ['outdoor movies des moines', 'summer', 2],
  ['des moines arts festival', 'summer', 2],
  ['80 35 music festival', 'summer', 3],
  ['world food and music festival des moines', 'fall', 2],
  ['mothers day brunch des moines', 'spring', 2],
  ['valentines day des moines', 'winter', 2],
  ['st patricks day des moines', 'spring', 2],
];
each(SEASONAL, ([kw, season, priority]) => add(kw, {
  cluster: 'Seasonal', subcluster: season, intent: 'discovery', seasonality: 'seasonal-' + season,
  route: '/articles', gap: 'seasonal-editorial-cvb-thin', priority,
}));

// ---------------------------------------------------------------- 8. outdoors and trails

const OUTDOORS = [
  ['high trestle trail parking', 1],
  ['high trestle trail bike rental', 2],
  ['raccoon river valley trail', 2],
  ['neal smith trail des moines', 2],
  ['great western trail des moines', 2],
  ['best bike trails des moines', 1],
  ['best hiking near des moines', 1],
  ['dog parks des moines', 1],
  ['disc golf des moines', 2],
  ['kayaking des moines', 2],
  ['fishing near des moines', 2],
  ['campgrounds near des moines', 2],
  ['state parks near des moines', 2],
  ['jester park', 3],
  ['big creek state park', 3],
  ['ledges state park', 3],
  ['grays lake park des moines', 2],
  ['waterfalls near des moines', 3],
  ['scenic drives near des moines', 3],
];
each(OUTDOORS, ([kw, priority]) => add(kw, {
  cluster: 'Outdoors', intent: 'discovery', route: '/outdoors',
  gap: 'cvb-thin-on-trails-and-parks', priority,
}));

// ---------------------------------------------------------------- 9. nightlife

const NIGHTLIFE = [
  ['breweries in des moines', 1],
  ['best bars in des moines', 1],
  ['brewery tour des moines', 2],
  ['wineries near des moines', 2],
  ['distilleries des moines', 2],
  ['live music venues des moines', 1],
  ['comedy clubs des moines', 2],
  ['karaoke des moines', 2],
  ['trivia night des moines', 2],
  ['des moines nightlife', 3],
  ['dueling pianos des moines', 3],
  ['dive bars des moines', 3],
];
each(NIGHTLIFE, ([kw, priority]) => add(kw, {
  cluster: 'Nightlife', intent: 'discovery', route: '/breweries',
  gap: 'cvb-lists-does-not-rank', priority,
}));

// ---------------------------------------------------------------- 10. sports

const SPORTS = [
  ['iowa cubs schedule', 1],
  ['iowa cubs tickets', 2],
  ['principal park parking', 1],
  ['iowa wild schedule', 2],
  ['des moines menace schedule', 2],
  ['iowa barnstormers schedule', 3],
  ['drake relays', 3],
  ['iowa cubs fireworks nights', 2],
];
each(SPORTS, ([kw, priority]) => add(kw, {
  cluster: 'Sports', intent: 'discovery', route: '/sports', seasonality: 'recurring',
  gap: 'requires-freshness', priority,
}));

// ---------------------------------------------------------------- 11. questions and AI search
// Written as questions because that is the shape of a prompt. Here, being cited in an
// AI answer matters more than the blue link, and the CVB publishes no JSON-LD at all.

const QUESTIONS = [
  ['is des moines worth visiting', '/visitors-guide', 1],
  ['what is des moines known for', '/visitors-guide', 1],
  ['how many days do you need in des moines', '/itineraries', 1],
  ['best time to visit des moines', '/visitors-guide', 1],
  ['what to do in des moines when it rains', '/things-to-do', 1],
  ['is downtown des moines walkable', '/getting-around', 2],
  ['how to get around des moines without a car', '/getting-around', 2],
  ['des moines weekend itinerary', '/itineraries', 1],
  ['one day in des moines', '/itineraries', 2],
  ['free things to do in des moines', '/events/free', 1],
  ['cheap things to do in des moines', '/things-to-do/budget', 2],
  ['des moines layover what to do', '/itineraries', 3],
  ['is the iowa state fair worth it', '/iowa-state-fair', 2],
  ['what to do in des moines in winter', '/things-to-do/winter', 1],
  ['unique things to do in des moines', '/things-to-do', 2],
  ['hidden gems des moines', '/things-to-do', 2],
];
each(QUESTIONS, ([kw, route, priority]) => add(kw, {
  cluster: 'Question-AI', intent: 'research', route,
  gap: 'answer-format-cvb-does-not-publish', priority,
}));

// ---------------------------------------------------------------- 12. hotels, event-adjacent
// Scoped deliberately. Booking and Google own generic hotel search; the one angle we
// hold is knowing what the event is and where it is.

const HOTELS = [
  ['hotels near iowa events center', 1],
  ['hotels near iowa state fairgrounds', 1],
  ['hotels near des moines airport with shuttle', 2],
  ['hotels near drake university', 2],
  ['downtown des moines hotels with pool', 2],
  ['pet friendly hotels des moines', 2],
  ['hotels with water park near des moines', 3],
  ['where to stay for the iowa state fair', 1],
];
each(HOTELS, ([kw, priority]) => add(kw, {
  cluster: 'Hotels-event-adjacent', intent: 'transactional', route: '/stay',
  gap: 'event-context-ota-lacks', priority,
}));

// ---------------------------------------------------------------- 13. Iowa State Fair long-tail
// The CVB and the Fair own the head term. Neither answers the logistics well.

const FAIR = [
  ['iowa state fair parking', 1],
  ['iowa state fair free concerts 2026', 1],
  ['iowa state fair schedule 2026', 1],
  ['iowa state fair food list', 1],
  ['iowa state fair shuttle', 2],
  ['iowa state fair tickets discount', 2],
  ['iowa state fair with toddlers', 2],
  ['iowa state fair best food 2026', 2],
];
each(FAIR, ([kw, priority]) => add(kw, {
  cluster: 'Iowa-State-Fair', intent: 'logistics', seasonality: 'seasonal-summer',
  route: '/iowa-state-fair', gap: 'no-one-answers-logistics', priority,
}));

// ---------------------------------------------------------------- 14. group and venue hire
// Included so the volume pull covers it, not because we should chase it. Wedding and
// event-venue terms are commercially contested and priced accordingly.

const GROUP = [
  ['event venues des moines', 3],
  ['wedding venues des moines', 3],
  ['bachelorette party des moines', 3],
  ['team building activities des moines', 3],
  ['group activities des moines', 2],
  ['corporate event ideas des moines', 3],
];
each(GROUP, ([kw, priority]) => add(kw, {
  cluster: 'Group-and-venue-hire', intent: 'transactional', route: '/group-travel',
  gap: 'contested-measure-before-committing', priority,
}));

// ---------------------------------------------------------------- 15. control terms
// Head terms we currently rank 30-57 for, carried so the volume pull shows the long
// tail against its own baseline rather than in isolation.

const CONTROLS = [
  'things to do in des moines',
  'des moines events',
  'des moines restaurants',
  'best restaurants in des moines',
  'des moines attractions',
  'things to do in des moines this weekend',
  'places to eat in des moines',
  'fun things to do in des moines',
];
each(CONTROLS, (kw) => add(kw, {
  cluster: 'Control-head-term', intent: 'discovery', route: '/',
  gap: 'cvb-dominates-do-not-target', priority: 3,
  notes: 'baseline only; ranks 30-57 today with zero clicks',
}));

// ---------------------------------------------------------------- write

const COLUMNS = ['keyword', 'cluster', 'subcluster', 'intent', 'seasonality', 'target_route',
  'route_status', 'catchdm_gap', 'priority', 'notes'];

const csvCell = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const toCsv = (cols, data) =>
  [cols.join(','), ...data.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'keyword-seed-master.csv'), toCsv(COLUMNS, rows), 'utf8');
writeFileSync(join(OUT_DIR, 'keyword-upload-list.csv'), toCsv(['keyword'], rows), 'utf8');

const byCluster = {};
const byStatus = {};
for (const r of rows) {
  byCluster[r.cluster] = (byCluster[r.cluster] || 0) + 1;
  byStatus[r.route_status] = (byStatus[r.route_status] || 0) + 1;
}
console.log(rows.length + ' keywords written to docs/seo/keyword-research/');
console.log('\nBy cluster:');
for (const [k, v] of Object.entries(byCluster).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(4) + '  ' + k);
}
console.log('\nBy route status:');
for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(4) + '  ' + k);
}
