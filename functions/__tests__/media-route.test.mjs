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
console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
