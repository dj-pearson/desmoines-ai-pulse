/**
 * Checks for the SPA-fallback canonical guard (WEB-SEO-006).
 *
 *   npx tsx functions/__tests__/middleware-canonical.test.mjs
 *
 * withSelfCanonical was previously gated on `response.status === 404`. Pages
 * runs in single-page-app mode here (public/_routes.json includes "/*"), so the
 * fallback answers 200 and that branch never ran - every entity URL served the
 * homepage verbatim, canonical included. The gate is now isHomepageShell, and
 * the two directions below are what it has to get right:
 *
 *   a false NEGATIVE puts the whole sitemap back to claiming to be the homepage;
 *   a false POSITIVE strips the JSON-LD off a real prerendered page.
 *
 * The rewrite's DECISIONS are covered at the bottom of this file. What is still
 * not covered is HTMLRewriter applying them, which is Cloudflare's code and has
 * no Node equivalent.
 */
const { isHomepageShell, selfCanonicalRewrites } = await import('../_middleware.ts');
const ORIGIN = 'https://desmoinesinsider.com';
let bad = 0;
const ck = (n, c) => { console.log((c ? '  ok    ' : '  FAIL  ') + n); if (!c) bad++; };

const shell = (href) => `<html><head><link rel="canonical" href="${href}" data-rh="true"></head></html>`;

console.log('the fallback, which must be rewritten');
ck('root canonical with trailing slash', isHomepageShell(shell(`${ORIGIN}/`), ORIGIN));
ck('root canonical without trailing slash', isHomepageShell(shell(ORIGIN), ORIGIN));
ck('single quotes', isHomepageShell(`<link rel='canonical' href='${ORIGIN}/'>`, ORIGIN));
ck('attributes reordered', isHomepageShell(`<link data-rh="true" href="${ORIGIN}/" rel="canonical">`, ORIGIN));

console.log('\nreal pages, which must pass through untouched');
ck('prerendered hub', !isHomepageShell(shell(`${ORIGIN}/events`), ORIGIN));
ck('prerendered entity', !isHomepageShell(shell(`${ORIGIN}/events/some-show-2026-11-05`), ORIGIN));
ck('another origin', !isHomepageShell(shell('https://example.com/'), ORIGIN));
ck('no canonical at all', !isHomepageShell('<html><head></head></html>', ORIGIN));
ck('canonical with no href', !isHomepageShell('<link rel="canonical">', ORIGIN));
ck('empty document', !isHomepageShell('', ORIGIN));


console.log('\nthe rewrite itself (WEB-SEO-006)');
{
  // The gate above decides WHETHER to rewrite; these three decide WHAT the
  // crawler ends up reading. This fix has already been dead once - gated on a
  // 404 that single-page-app mode never returns - so the half that produces
  // the output is the half worth pinning.
  const PAGE = 'https://desmoinesinsider.com/restaurants/fongs-pizza';
  const rules = selfCanonicalRewrites(PAGE);

  const canonical = rules.find((r) => r.selector.includes('canonical'));
  ck('canonical is set, not removed', !!canonical && canonical.set === 'href', canonical);
  ck(
    'canonical points at the REQUESTED url, not the origin',
    canonical?.to === PAGE,
    canonical?.to,
  );

  const og = rules.find((r) => r.selector.includes('og:url'));
  // og:url left saying "/" is the same duplicate claim in the channel that
  // actually renders link previews, and it is the easiest of the three to drop.
  ck('og:url travels with the canonical', og?.set === 'content' && og?.to === PAGE, og);

  const ld = rules.find((r) => r.selector.includes('ld+json'));
  // The shell is the HOMEPAGE, so its JSON-LD describes the homepage. Left at
  // an entity URL it is structured data that contradicts the page.
  ck('the homepage JSON-LD is removed', !!ld && ld.remove === true, ld);

  ck('nothing else is touched', rules.length === 3, rules.length);

  const other = selfCanonicalRewrites('https://desmoinesinsider.com/events/x');
  ck(
    'the url is per-request, not captured once',
    other.find((r) => r.selector.includes('canonical'))?.to ===
      'https://desmoinesinsider.com/events/x',
  );
}

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
