/**
 * Offline checks for the /calendar/<slug>.ics feeds (growth roadmap #9).
 *
 *   npx tsx functions/__tests__/calendar-route.test.mjs
 *
 * What a subscriber's calendar does with a bad feed is the reason for most of
 * these: an unknown path must not reach the database, an upstream error must
 * be a non-cached 502 (an empty 200 would erase every event from every
 * subscribed calendar), the query must carry all three unpublish filters, and
 * the output must be valid enough that a strict parser does not drop it.
 *
 * fetch and the edge cache are stubbed. The real Cloudflare runtime and a real
 * PostgREST are not in this container.
 */
const route = await import('../calendar/[[path]].ts');
const feeds = await import('../../src/lib/calendarFeeds.ts');
const ics = await import('../../src/lib/icsEvent.ts');

let bad = 0;
const ck = (n, c) => { console.log((c ? '  ok    ' : '  FAIL  ') + n); if (!c) bad++; };

console.log('paths');
ck('/calendar/music.ics -> music', feeds.feedSlugFromPath('/calendar/music.ics') === 'music');
ck('/calendar/all.ics -> all', feeds.feedSlugFromPath('/calendar/all.ics') === 'all');
for (const p of ['/calendar/music', '/calendar/../x.ics', '/calendar/a/b.ics', '/calendar/MUSIC.ics', '/calendar/.ics', '/x/music.ics'])
  ck(`refuses ${p}`, feeds.feedSlugFromPath(p) === null);

console.log('\nfeed list');
const slugs = feeds.CALENDAR_FEEDS.map((f) => f.slug);
ck('slugs are unique', new Set(slugs).size === slugs.length);
ck('has all, free and music', ['all', 'free', 'music'].every((s) => slugs.includes(s)));
ck('leaves out "other"', !slugs.includes('other'));
ck('every slug matches the path guard', slugs.every((s) => feeds.feedSlugFromPath(`/calendar/${s}.ics`) === s));
ck('feedForCategory("Music") is music', feeds.feedForCategory('Music').slug === 'music');
ck('feedForCategory(unknown) falls back to all', feeds.feedForCategory('Nope').slug === 'all');

console.log('\nquery');
const q = feeds.feedRestQuery(feeds.feedForSlug('music'), '2026-11-07T06:00:00.000Z');
ck('filters is_merged', q.get('is_merged') === 'neq.true');
ck('filters is_hidden', q.get('is_hidden') === 'neq.true');
ck('filters archived_at', q.get('archived_at') === 'is.null');
const WINDOW = 'date.gte.2026-11-07T06:00:00.000Z,end_date.gte.2026-11-07T06:00:00.000Z';
ck('lower bound is the given Central day start, or a run still going', feeds.feedWindowOrFilter(new Date('2026-11-07T06:00:00.000Z')) === WINDOW && q.get('or') === `(${WINDOW})`);
ck('no bare date lower bound outside the or', !q.getAll('date').some((v) => v.startsWith('gte.')));
ck('upper bound is FEED_WINDOW_DAYS later', q.getAll('date').includes('lt.2027-01-06T06:00:00.000Z'));
ck('category is exact', q.get('category') === 'eq.Music');
ck('limit is capped', q.get('limit') === String(feeds.FEED_MAX_EVENTS));
ck('all feed has no category filter', !feeds.feedRestQuery(feeds.feedForSlug('all'), '2026-11-07T06:00:00.000Z').has('category'));
const fq = feeds.feedRestQuery(feeds.feedForSlug('free'), '2026-11-07T06:00:00.000Z');
ck('free feed uses FREE_PRICE_FILTER', fq.get('or')?.includes('price.eq.$0'));
ck('free feed ANDs the window with the price group', fq.getAll('or').length === 1 && fq.get('or').startsWith(`(and(or(${WINDOW}),or(`));

// The window group evaluated the way PostgREST would, over the two columns it
// names. A multi-day run that started before today must stay in the feed: a
// subscribing client deletes every event the next copy leaves out.
const windowKeeps = (group, row) => group.split(',').some((arm) => {
  const [col, op, ...rest] = arm.split('.');
  const v = row[col];
  return op === 'gte' && v != null && Date.parse(v) >= Date.parse(rest.join('.'));
});
const fairDay3 = feeds.feedWindowOrFilter(new Date('2026-08-15T05:00:00.000Z'));
ck('State Fair on day 3 stays in', windowKeeps(fairDay3, { date: '2026-08-13T14:00:00Z', end_date: '2026-08-23T23:00:00Z' }));
ck('a run ending later today stays in', windowKeeps(fairDay3, { date: '2026-08-10T14:00:00Z', end_date: '2026-08-15T15:00:00Z' }));
ck('a run that ended yesterday is out', !windowKeeps(fairDay3, { date: '2026-08-10T14:00:00Z', end_date: '2026-08-14T23:00:00Z' }));
ck('a one-off from yesterday with no end is out', !windowKeeps(fairDay3, { date: '2026-08-14T23:00:00Z', end_date: null }));
ck('tonight with no end stays in', windowKeeps(fairDay3, { date: '2026-08-16T00:30:00Z', end_date: null }));

console.log('\nlinks');
const links = feeds.feedLinks(feeds.feedForSlug('music'), 'https://desmoinesinsider.com');
ck('https', links.https === 'https://desmoinesinsider.com/calendar/music.ics');
ck('webcal', links.webcal === 'webcal://desmoinesinsider.com/calendar/music.ics');
ck('google carries the webcal URL', links.google.includes(encodeURIComponent(links.webcal)));
ck('outlook carries the https URL', new URL(links.outlook).searchParams.get('url') === links.https);

console.log('\nrendering');
const stamp = new Date('2026-11-07T12:00:00Z');
const rows = [
  { id: 'e1', title: 'Jazz, Wine; and More', date: '2026-11-08T01:00:00+00:00', event_start_utc: '2026-11-08T01:00:00+00:00', venue: 'Hoyt Sherman Place', enhanced_description: 'x'.repeat(300) },
  { id: 'e2', title: 'Market', date: '2026-11-09T06:00:00+00:00', time_tbd: true },
  { id: 'e3', title: 'Broken', date: 'not a date' },
];
const body = route.renderFeed('music', rows, stamp);
const lines = body.split('\r\n');
ck('starts and ends a VCALENDAR', lines[0] === 'BEGIN:VCALENDAR' && lines.at(-1) === 'END:VCALENDAR');
ck('names the calendar', body.includes('X-WR-CALNAME:Des Moines Insider: Music'));
ck('asks clients to refresh', body.includes(`REFRESH-INTERVAL;VALUE=DURATION:${feeds.FEED_REFRESH_INTERVAL}`));
ck('two events, the unparseable one skipped', (body.match(/BEGIN:VEVENT/g) || []).length === 2);
ck('no per-event alarms in a feed', !body.includes('VALARM'));
ck('UTC start for the timed event', body.includes('DTSTART:20261108T010000Z'));
ck('time TBD exports as an all-day date', body.includes('DTSTART;VALUE=DATE:20261109'));
ck('escapes commas and semicolons', body.includes('SUMMARY:Jazz\\, Wine\\; and More'));
const encoder = new TextEncoder();
ck('every line is at most 75 octets', lines.every((l) => encoder.encode(l).length <= 75));
ck('folding round-trips', body.replace(/\r\n /g, '').includes('x'.repeat(300)));
ck('unknown slug renders nothing', route.renderFeed('nope', rows, stamp) === null);
ck('folding keeps multibyte characters whole',
   ics.foldIcsLine('LOCATION:' + 'é'.repeat(80)).replace(/\r\n /g, '') === 'LOCATION:' + 'é'.repeat(80));

console.log('\nonRequest');
const ENV = { VITE_SUPABASE_URL: 'https://p.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' };
const store = new Map();
globalThis.caches = { default: {
  match: async (req) => store.get(req.url)?.clone(),
  put: async (req, res) => { store.set(req.url, res); },
} };
let fetched = [];
const ctx = (path, method = 'GET') => {
  const pending = [];
  return { pending, c: { request: new Request(`https://desmoinesinsider.com${path}`, { method }), env: ENV, waitUntil: (p) => pending.push(p) } };
};

globalThis.fetch = async (url) => { fetched.push(String(url)); return new Response(JSON.stringify(rows.slice(0, 2)), { status: 200 }); };
let { c, pending } = ctx('/calendar/nope.ics');
let res = await route.onRequest(c);
ck('unknown feed is 404', res.status === 404);
ck('and never touches the database', fetched.length === 0);

({ c, pending } = ctx('/calendar/music.ics?utm=x'));
res = await route.onRequest(c);
await Promise.all(pending);
ck('known feed is 200', res.status === 200);
ck('served as text/calendar', res.headers.get('content-type').startsWith('text/calendar'));
ck('cacheable for an hour', res.headers.get('cache-control') === `public, max-age=${feeds.FEED_CACHE_SECONDS}`);
ck('queried events on the configured origin', fetched[0]?.startsWith('https://p.supabase.co/rest/v1/events?'));
ck('body has the events', (await res.text()).includes('BEGIN:VEVENT'));
ck('cached without the query string', store.has('https://desmoinesinsider.com/calendar/music.ics'));

({ c, pending } = ctx('/calendar/music.ics'));
res = await route.onRequest(c);
ck('second request is a cache hit', res.status === 200 && fetched.length === 1);

store.clear();
globalThis.fetch = async () => new Response('boom', { status: 500 });
({ c, pending } = ctx('/calendar/arts.ics'));
res = await route.onRequest(c);
await Promise.all(pending);
ck('upstream error is 502', res.status === 502);
ck('and not cached', store.size === 0 && res.headers.get('cache-control') === 'no-store');

globalThis.fetch = async () => { throw new Error('network'); };
({ c, pending } = ctx('/calendar/arts.ics'));
res = await route.onRequest(c);
ck('network failure is 502, not a throw', res.status === 502);

({ c, pending } = ctx('/calendar/music.ics', 'POST'));
res = await route.onRequest(c);
ck('POST is 405', res.status === 405);

({ c, pending } = ctx('/calendar/music.ics'));
c.env = {};
res = await route.onRequest(c);
ck('missing config is 502', res.status === 502);

console.log('\npersonal feeds: parsing and criteria');
const TOKEN = '3f2b9c1e-8a4d-4f6e-9b2a-1c3d5e7f9a0b';
ck('token path parses', feeds.personalFeedTokenFromPath(`/calendar/my/${TOKEN}.ics`) === TOKEN);
ck('uppercase token is lowercased', feeds.personalFeedTokenFromPath(`/calendar/my/${TOKEN.toUpperCase()}.ics`) === TOKEN);
for (const p of ['/calendar/my/abc.ics', `/calendar/my/${TOKEN}`, `/calendar/my/${TOKEN}.ics/x`, `/calendar/${TOKEN}.ics`, '/calendar/my/zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz.ics'])
  ck(`refuses ${p}`, feeds.personalFeedTokenFromPath(p) === null);
ck('a fixed slug is not a token', feeds.personalFeedTokenFromPath('/calendar/music.ics') === null);
ck('personal URL', feeds.personalFeedUrl(TOKEN, 'https://desmoinesinsider.com') === `https://desmoinesinsider.com/calendar/my/${TOKEN}.ics`);

const web = feeds.personalFeedFromSavedSearch({ name: 'Jazz in WDM', search_type: 'event_list', filters: { q: 'live jazz', location: 'west-des-moines', price: 'free', category: 'Music', preset: 'this-weekend' } });
ck('web row: name', web.name === 'Des Moines Insider: Jazz in WDM');
ck('web row: search', web.criteria.search === 'live jazz');
ck('web row: category', web.criteria.category === 'Music');
ck('web row: area', web.criteria.area?.slug === 'west-des-moines');
ck('web row: free', web.criteria.freeOnly === true);
const ios = feeds.personalFeedFromSavedSearch({ name: 'iOS', search_type: 'event_list', filters: { query: 'trivia', tab: 'events' } });
ck('iOS row reads `query`', ios.criteria.search === 'trivia');
ck('restaurant search has no feed', feeds.personalFeedFromSavedSearch({ name: 'x', search_type: 'advanced', filters: { query: 'pho', tab: 'restaurants' } }) === null);
ck('empty event search is every event', feeds.personalFeedFromSavedSearch({ name: '', search_type: 'event_list', filters: {} }).name === 'Des Moines Insider: Every new event');

console.log('\npersonal feeds: query');
const pq = feeds.feedRestQuery(web.criteria, '2026-11-07T06:00:00.000Z');
ck('search uses the hub tsquery', pq.get('search_vector') === 'fts(english).live & jazz:*');
ck('quoted search uses websearch', feeds.feedRestQuery({ search: '"state fair"' }, '2026-11-07T06:00:00.000Z').get('search_vector') === 'wfts(english)."state fair"');
ck('free and suburb share ONE or=', pq.getAll('or').length === 1 && pq.get('or').startsWith('(and(or(') && pq.get('or').includes('city.ilike.West Des Moines'));
ck('still filters all three unpublish switches', pq.get('is_merged') === 'neq.true' && pq.get('is_hidden') === 'neq.true' && pq.get('archived_at') === 'is.null');
const bq = feeds.feedRestQuery({ area: { slug: 'b', label: 'B', kind: 'bbox', bbox: { south: 1, west: 2, north: 3, east: 4 } } }, '2026-11-07T06:00:00.000Z');
ck('bbox area is four bounds', JSON.stringify(bq.getAll('latitude')) === '["gte.1","lte.3"]' && JSON.stringify(bq.getAll('longitude')) === '["gte.2","lte.4"]');
const cq = feeds.feedRestQuery({ area: { slug: 'dm', label: 'DM', kind: 'city', city: 'Des Moines' } }, '2026-11-07T06:00:00.000Z');
ck('city without fallback is an ilike', cq.get('city') === 'ilike.Des Moines' && cq.getAll('or').length === 1 && cq.get('or') === `(${WINDOW})`);

console.log('\npersonal feeds: onRequest');
store.clear();
let calls = [];
const rpcRow = [{ name: 'Jazz in WDM', search_type: 'event_list', filters: { q: 'jazz' } }];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/rpc/saved_search_calendar_feed')) return new Response(JSON.stringify(rpcRow), { status: 200 });
  return new Response(JSON.stringify(rows.slice(0, 1)), { status: 200 });
};
({ c, pending } = ctx(`/calendar/my/${TOKEN}.ics`));
res = await route.onRequest(c);
await Promise.all(pending);
ck('personal feed is 200', res.status === 200);
ck('RPC got the token', JSON.parse(calls[0].init.body).p_token === TOKEN && calls[0].init.method === 'POST');
ck('events query carries the saved search', decodeURIComponent(calls[1].url).includes('search_vector=fts(english).jazz:*'));
ck('named after the saved search', (await res.text()).includes('X-WR-CALNAME:Des Moines Insider: Jazz in WDM'));
ck('noindex', res.headers.get('x-robots-tag') === 'noindex, nofollow');
ck('fixed feeds are not noindexed', !route.feedHeaders('music').has('x-robots-tag'));

calls = [];
({ c, pending } = ctx(`/calendar/my/${TOKEN.toUpperCase()}.ics`));
res = await route.onRequest(c);
ck('uppercase spelling hits the same cache entry', res.status === 200 && calls.length === 0);

store.clear();
globalThis.fetch = async () => new Response('[]', { status: 200 });
({ c, pending } = ctx(`/calendar/my/${TOKEN}.ics`));
res = await route.onRequest(c);
ck('unknown or revoked token is 404', res.status === 404);

globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 });
({ c, pending } = ctx(`/calendar/my/${TOKEN}.ics`));
res = await route.onRequest(c);
await Promise.all(pending);
ck('RPC not deployed is 502, not a cached 404', res.status === 502 && store.size === 0);

globalThis.fetch = async (url) => String(url).includes('/rpc/')
  ? new Response(JSON.stringify([{ name: 'r', search_type: 'advanced', filters: { tab: 'restaurants' } }]), { status: 200 })
  : new Response('[]', { status: 200 });
({ c, pending } = ctx(`/calendar/my/${TOKEN}.ics`));
res = await route.onRequest(c);
ck('a non-event saved search is 404', res.status === 404);

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
