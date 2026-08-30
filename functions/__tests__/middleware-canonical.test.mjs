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
 * The rewrite itself needs HTMLRewriter and is not covered here.
 */
const { isHomepageShell } = await import('../_middleware.ts');
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

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
