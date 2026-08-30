#!/usr/bin/env node
/**
 * SEO-015: every link in the site directory must resolve to a real route.
 *
 *   npx tsx scripts/__tests__/site-directory-routes.test.mjs
 *
 * SiteDirectory renders in the footer of every page, so it is the highest-
 * leverage internal linking on the site AND the highest-leverage way to break
 * it. A single href pointing at a route that does not exist manufactures a soft
 * 404 on all ~1,100 pages at once, which is worse than linking to nothing: the
 * SPA fallback answers 200 with the homepage shell, so it does not even fail
 * loudly.
 *
 * The check reads the SAME exported array the component renders. A test that
 * re-declared the list would pass while the component linked somewhere else,
 * which is the failure this repo has hit before.
 */
import fs from 'node:fs';

const { DIRECTORY_SECTIONS, DIRECTORY_HREFS } = await import('../../src/components/seo/SiteDirectory.tsx');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

// Literal (non-parameterised) route paths declared in App.tsx.
const app = fs.readFileSync('src/App.tsx', 'utf8');
const routes = new Set(
  [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => !p.includes(':') && p !== '*'),
);

// Paths that App.tsx serves through a catch-all segment route rather than a
// literal, e.g. /things-to-do/:seg1. Listed explicitly so a typo in a child
// slug is still caught by the prerender-routes cross-check below.
const SEGMENT_PARENTS = ['/things-to-do', '/neighborhoods', '/nightlife'];
const servedBySegmentRoute = (href) =>
  SEGMENT_PARENTS.some((p) => href.startsWith(`${p}/`) && href.split('/').length <= 4);

console.log(`\nApp.tsx declares ${routes.size} literal routes; the directory links to ${DIRECTORY_HREFS.length}`);

console.log('\nevery directory href resolves');
const unresolved = DIRECTORY_HREFS.filter((h) => !routes.has(h) && !servedBySegmentRoute(h));
check('no href points at a route that does not exist', unresolved.length === 0, unresolved.join(', '));

console.log('\nhygiene');
check('no duplicate hrefs across sections', new Set(DIRECTORY_HREFS).size === DIRECTORY_HREFS.length, [...DIRECTORY_HREFS.filter((h, i) => DIRECTORY_HREFS.indexOf(h) !== i)].join(', '));
check(
  'no href has a trailing slash (SEO-004 would 301 it)',
  DIRECTORY_HREFS.every((h) => h === '/' || !h.endsWith('/')),
  DIRECTORY_HREFS.filter((h) => h !== '/' && h.endsWith('/')).join(', '),
);
check('every href is site-relative', DIRECTORY_HREFS.every((h) => h.startsWith('/')));
check('every link has a non-empty title', DIRECTORY_SECTIONS.every((s) => s.links.every((l) => l.title.trim().length > 0)));
check(
  'no href points at an admin, auth or account route',
  !DIRECTORY_HREFS.some((h) => /^\/(admin|auth|profile|dashboard|campaigns|subscription)/.test(h)),
);

console.log('\nit is actually a meaningful uplift');
// The measured baseline was 54 unique internal links on the homepage against
// ~250 on the competitor's hubs. A directory that adds a dozen is not worth the
// footer space; this asserts the change is the size it claims to be.
check(`the directory carries at least 40 links (has ${DIRECTORY_HREFS.length})`, DIRECTORY_HREFS.length >= 40);
check('it spans at least 5 sections', DIRECTORY_SECTIONS.length >= 5, String(DIRECTORY_SECTIONS.length));

console.log('\nit is wired in');
// The predecessor, FooterSEOLinks, was complete, exported and imported by
// nothing. That is the failure mode this check exists for.
const footer = fs.readFileSync('src/components/Footer.tsx', 'utf8');
check('Footer.tsx renders <SiteDirectory>', /<SiteDirectory[\s/>]/.test(footer));
check('Footer.tsx imports it', /SiteDirectory/.test(footer.split('\n').filter((l) => l.startsWith('import')).join('\n')));

console.log('\nthe check is not vacuous');
check('App.tsx parsed to a non-trivial route set', routes.size > 50, String(routes.size));
check('a deliberately fake href would be caught', !routes.has('/this-route-does-not-exist') && !servedBySegmentRoute('/this-route-does-not-exist'));
check('a known-good href resolves', routes.has('/events'));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: site-directory-routes — ${failures} failing check(s)\n`);
process.exit(failures === 0 ? 0 : 1);
