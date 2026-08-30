/**
 * SEO-004: trailing-slash URLs 301 to the unslashed form.
 *
 *   npx tsx functions/__tests__/middleware-trailing-slash.test.mjs
 *
 * Measured 2026-08-28: /restaurants and /restaurants/ were BOTH indexed and both
 * returned 200 - 20,789 impressions at position 24.4 against 5,401 at 25.1. The
 * same page competing with itself, on the hubs that already rank worst. /events,
 * /playgrounds, /stay and /events/date-night had the same split.
 *
 * The two directions that matter:
 *
 *   a false NEGATIVE leaves the duplication in place, which is where we started;
 *   a false POSITIVE redirects "/" or an asset, and "/" redirecting to itself is
 *   an infinite loop that takes the whole site down.
 *
 * So the root case and the loop case are asserted as hard as the redirect is.
 */
const { trailingSlashRedirect } = await import('../_middleware.ts');

let bad = 0;
const ck = (n, c, detail = '') => {
  console.log((c ? '  ok    ' : '  FAIL  ') + n + (c || !detail ? '' : `  -> ${detail}`));
  if (!c) bad++;
};
const at = (u) => trailingSlashRedirect(new URL(u));
const O = 'https://desmoinesinsider.com';

console.log('the duplicates measured in Search Console');
for (const p of ['/restaurants', '/events', '/playgrounds', '/stay', '/events/date-night']) {
  ck(`${p}/ -> ${p}`, at(`${O}${p}/`) === `${O}${p}`, String(at(`${O}${p}/`)));
}

console.log('\nalready canonical, must NOT redirect');
ck('the root "/" is left alone', at(`${O}/`) === null, String(at(`${O}/`)));
ck('an unslashed path is left alone', at(`${O}/restaurants`) === null);
ck('a deep unslashed path is left alone', at(`${O}/restaurants/atlas-caf`) === null);

console.log('\nno redirect loop is reachable');
// Every one of these must either be null or point somewhere DIFFERENT from the
// request. A rule that returns its own input is an infinite loop at the edge.
for (const p of ['/', '//', '///', '/a/', '/a//', '/a///']) {
  const got = at(`${O}${p}`);
  ck(`${p} does not redirect to itself`, got === null || got !== `${O}${p}`, String(got));
}
ck('a path of only slashes is treated as canonical, not stripped to nothing', at(`${O}//`) === null, String(at(`${O}//`)));

console.log('\nthe redirect is idempotent');
// Following it once must land somewhere that does not redirect again. A chain
// leaks PageRank and Search Console reports it as a soft error.
const once = at(`${O}/restaurants/`);
ck('one hop reaches a stable URL', once !== null && at(once) === null, String(once));

console.log('\nquery strings and fragments survive');
// A 301 that drops these loses the filter or the UTM tag that brought the
// visitor, which costs more than the duplication it fixes.
ck(
  'query string preserved',
  at(`${O}/restaurants/?cuisine=Bar&page=2`) === `${O}/restaurants?cuisine=Bar&page=2`,
  String(at(`${O}/restaurants/?cuisine=Bar&page=2`)),
);
ck(
  'utm parameters preserved',
  at(`${O}/events/?utm_source=x&utm_medium=y`) === `${O}/events?utm_source=x&utm_medium=y`,
);
ck('fragment preserved', at(`${O}/events/#today`) === `${O}/events#today`);
ck(
  'an encoded path is not double-encoded',
  at(`${O}/restaurants/caf%C3%A9/`) === `${O}/restaurants/caf%C3%A9`,
  String(at(`${O}/restaurants/caf%C3%A9/`)),
);

console.log('\nthe check is not vacuous');
ck('it returns a redirect for at least one real input', at(`${O}/events/`) !== null);
ck('it returns null for at least one real input', at(`${O}/events`) === null);

console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: middleware-trailing-slash — ${bad} failing check(s)\n`);
process.exit(bad === 0 ? 0 : 1);
