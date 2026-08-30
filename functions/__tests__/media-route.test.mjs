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

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
