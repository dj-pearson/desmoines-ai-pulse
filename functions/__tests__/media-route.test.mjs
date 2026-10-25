/**
 * Offline checks for the /media/* route's path guard (WEB-OPS-023).
 *
 *   npx tsx functions/__tests__/media-route.test.mjs
 *
 * The route forwards a caller-supplied path to the Supabase storage origin, so
 * the guard is the whole security surface: an allowlist, not a `..` denylist,
 * because a denylist has to anticipate every encoding of traversal. The refusal
 * cases below are the ones that matter - a false NEGATIVE there is an open
 * proxy, and a false positive is a missing image.
 *
 * The caching and fetch behaviour is NOT tested: it needs a Cloudflare runtime
 * and a real storage origin, and this container has neither.
 */
const m = await import('../media/[[path]].ts');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  ok    ' : '  FAIL  ') + n); if (!c) bad++; };
console.log('paths that must be served');
for (const p of ['events/6f1e-4a2b/hero.jpg', 'restaurants/abc123/hero.webp', 'attractions/x/hero.png'])
  ck(p, m.isSafeMediaPath(p));
console.log('\npaths that must be refused');
for (const p of ['../../etc/passwd', 'events/../../secret.jpg', '/events/x/hero.jpg', 'events//x.jpg',
                 'events/x/hero', '', 'a'.repeat(600) + '.jpg', 'events/x/hero.jpg?x=1'])
  ck(JSON.stringify(p).slice(0, 42), !m.isSafeMediaPath(p));
console.log('\nupstream URL');
ck('joins without a double slash',
   m.upstreamUrlFor('https://p.supabase.co/', 'events/x/hero.jpg')
     === 'https://p.supabase.co/storage/v1/object/public/media/events/x/hero.jpg');
// WEB-PERF-004 round two. Sizing params on /object/public/ are IGNORED, not
// honoured, so a transform that keeps that path serves the full-size original
// while looking like it worked. That is the whole defect; these are the checks
// that would have caught it.
console.log('\ntransform params -> render endpoint');
const q = (s) => new URLSearchParams(s);
const OBJ = 'https://p.supabase.co/storage/v1/object/public/media/events/x/hero.jpg';

ck('no params is null, so the object path is unchanged',
   m.mediaTransformFrom(q('')) === null);
ck('no params still serves /object/public/',
   m.upstreamUrlFor('https://p.supabase.co', 'events/x/hero.jpg', m.mediaTransformFrom(q(''))) === OBJ);

const t = m.mediaTransformFrom(q('width=640&quality=75&format=webp'));
ck('reads width, quality and format', t.width === 640 && t.quality === 75 && t.format === 'webp');

const out = m.upstreamUrlFor('https://p.supabase.co', 'events/x/hero.jpg', t);
ck('switches to /render/image/public/', out.includes('/storage/v1/render/image/public/media/'));
ck('and does NOT keep /object/public/', !out.includes('/storage/v1/object/public/'));
ck('carries width=640', out.includes('width=640'));
ck('carries quality=75', out.includes('quality=75'));
ck('carries format=webp', out.includes('format=webp'));

// Junk is dropped, not refused: a typo in a srcset must not break the card.
console.log('\nout-of-bounds params are dropped, not served');
ck('width=banana is dropped', m.mediaTransformFrom(q('width=banana')) === null);
ck('width=0 is dropped',      m.mediaTransformFrom(q('width=0')) === null);
ck('width=99999 is dropped',  m.mediaTransformFrom(q('width=99999')) === null);
ck('quality=500 is dropped',  m.mediaTransformFrom(q('quality=500')) === null);
ck('format=exe is dropped',   m.mediaTransformFrom(q('format=exe')) === null);
ck('a dropped width falls back to the original object, not a 400',
   m.upstreamUrlFor('https://p.supabase.co', 'events/x/hero.jpg', m.mediaTransformFrom(q('width=99999'))) === OBJ);
ck('one good param survives a junk sibling',
   m.mediaTransformFrom(q('width=640&quality=nope')).width === 640
     && m.mediaTransformFrom(q('width=640&quality=nope')).quality === undefined);

// Hotels (20261020000002). A Places photo copy may be cached for 30 days at
// most and backfill-images deletes it before then; a year of edge cache would
// keep serving it after the delete.
console.log('\nPlaces photo copies get a short cache');
const COPY = 'hotels/0d3c1d2e-1111-4a2b-9c3d-123456789abc/places-photo-1760140800000.jpg';
ck('a Places copy path is served', m.isSafeMediaPath(COPY));
ck('a Places copy is cached for a day', m.maxAgeFor(COPY) === 86400);
ck('a normal hero keeps the year', m.maxAgeFor('events/x/hero.jpg') === 31536000);
ck('a name merely containing the words keeps the year',
   m.maxAgeFor('events/x/places-photo-gallery.jpg') === 31536000);

// Stored XSS through /media/*.svg. The route answers first-party and the site
// CSP in public/_headers does not reach a Function response, so an uploaded SVG
// with <script> ran as the site. These drive onRequest end to end with a stubbed
// origin (no `caches` in Node, so the cache branch is skipped).
console.log('\nfirst-party safety headers');
const realFetch = globalThis.fetch;
const serve = async (path, body, contentType, extraHeaders = {}) => {
  globalThis.fetch = async () => new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType, ETag: '"abc"', ...extraHeaders },
  });
  try {
    return await m.onRequest({
      request: new Request(`https://example.test/media/${path}`),
      env: { SUPABASE_URL: 'https://p.supabase.co' },
      params: { path: path.split('/') },
      waitUntil() {},
    });
  } finally {
    globalThis.fetch = realFetch;
  }
};

const svg = await serve('events/x/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml');
const svgCsp = svg.headers.get('Content-Security-Policy') ?? '';
ck('svg: 200', svg.status === 200);
ck('svg: nosniff', svg.headers.get('X-Content-Type-Options') === 'nosniff');
ck('svg: CSP sandbox', /(^|;\s*)sandbox(\s*;|$)/.test(svgCsp));
ck("svg: CSP default-src 'none' (no script-src)", svgCsp.includes("default-src 'none'") && !svgCsp.includes('script-src'));
ck('svg: still image/svg+xml, so <img> keeps working', svg.headers.get('Content-Type') === 'image/svg+xml');

const svgByType = await serve('events/x/hero.png', '<svg/>', 'image/svg+xml; charset=utf-8');
ck('svg by upstream content-type alone gets the CSP',
   /sandbox/.test(svgByType.headers.get('Content-Security-Policy') ?? ''));

const svgMislabelled = await serve('events/x/hero.svg', '<html><script>alert(1)</script></html>', 'text/html');
ck('.svg path served as text/html is downgraded to a download',
   svgMislabelled.headers.get('Content-Type') === 'application/octet-stream'
     && svgMislabelled.headers.get('Content-Disposition') === 'attachment');

const html = await serve('events/x/hero.jpg', '<script>alert(document.cookie)</script>', 'text/html; charset=utf-8');
ck('html upstream: not served as text/html', !/html/i.test(html.headers.get('Content-Type') ?? ''));
ck('html upstream: application/octet-stream', html.headers.get('Content-Type') === 'application/octet-stream');
ck('html upstream: Content-Disposition attachment', html.headers.get('Content-Disposition') === 'attachment');
ck('html upstream: nosniff', html.headers.get('X-Content-Type-Options') === 'nosniff');
ck('html upstream: CSP sandbox as a backstop', /sandbox/.test(html.headers.get('Content-Security-Policy') ?? ''));

const xml = await serve('events/x/hero.jpg', '<x/>', 'application/xhtml+xml');
ck('xhtml upstream is downgraded too', xml.headers.get('Content-Type') === 'application/octet-stream');
const none = await serve('events/x/hero.jpg', 'x', '');
ck('missing upstream content-type is downgraded', none.headers.get('Content-Type') === 'application/octet-stream');

const jpg = await serve('events/x/hero.jpg', 'JPEGBYTES', 'image/jpeg');
ck('raster: Content-Type unchanged', jpg.headers.get('Content-Type') === 'image/jpeg');
ck('raster: nosniff', jpg.headers.get('X-Content-Type-Options') === 'nosniff');
ck('raster: no CSP added', jpg.headers.get('Content-Security-Policy') === null);
ck('raster: no Content-Disposition', jpg.headers.get('Content-Disposition') === null);
ck('raster: year cache kept', jpg.headers.get('Cache-Control') === 'public, max-age=31536000');
ck('raster: ETag passed through', jpg.headers.get('ETag') === '"abc"');
ck('raster: X-Media-Origin kept', jpg.headers.get('X-Media-Origin') === 'supabase-storage');
ck('raster: body untouched', (await jpg.text()) === 'JPEGBYTES');

for (const [p, ct] of [['events/x/clip.mp4', 'video/mp4'], ['events/x/menu.pdf', 'application/pdf'],
                       ['events/x/f.woff2', 'font/woff2'], ['events/x/hero.webp', 'image/webp']]) {
  const r = await serve(p, 'x', ct);
  ck(`${ct} passes through`, r.headers.get('Content-Type') === ct && r.headers.get('Content-Disposition') === null);
}

console.log('\nhardenMediaHeaders on a cache hit or 304');
const h304 = new Headers({ ETag: '"abc"' });
m.hardenMediaHeaders(h304, 'events/x/hero.jpg', 304);
ck('304 without Content-Type is not turned into a download',
   h304.get('Content-Type') === null && h304.get('X-Content-Type-Options') === 'nosniff');
const hOld = new Headers({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000' });
m.hardenMediaHeaders(hOld, 'events/x/hero.svg');
ck('an SVG cached before the fix is hardened on the way out', /sandbox/.test(hOld.get('Content-Security-Policy') ?? ''));

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
