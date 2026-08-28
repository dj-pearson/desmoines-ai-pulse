#!/usr/bin/env node
/**
 * Every prerendered page must carry its own head (WEB-SEO-002, WEB-SEO-006).
 *
 * WEB-SEO-002 was "12 routes render no SEOHead": pages shipping with the shell's
 * default title, no canonical, and the site-wide description. prerender.mjs
 * still carries a comment saying "Twelve hub routes are in that state today",
 * and that is no longer true - all 35 routes were clean on the 2026-08-28 build.
 *
 * NOTHING WAS GUARDING IT. The property got fixed, the comment went stale, and
 * a route losing its SEOHead again would ship a 200 with the wrong canonical and
 * be found the next time somebody audited by hand. This is the same shape as the
 * skeleton gate: an ABSOLUTE assertion about the artifact, so a page that was
 * born wrong fails immediately rather than matching a baseline.
 *
 * WHAT IT ASSERTS, and each one is a distinct production failure:
 *   canonical present            a missing one lets Cloudflare's SPA fallback
 *                                decide, which is how every entity URL came to
 *                                claim it was the homepage (WEB-SEO-006)
 *   canonical matches the route  a canonical pointing elsewhere is a request to
 *                                deindex this page in favour of that one
 *   title present and UNIQUE     two routes sharing a title is the duplicate
 *                                content signal WEB-SEO-007 is about
 *   description present          without it Google writes its own from the page
 *
 * IT GATES. None of these move with live data - a page either declares itself or
 * it does not - so there is no quiet week that makes this fire, which is the
 * distinction from check-dom-budget.
 *
 * Requires a build first: it reads dist/.
 *
 *   node scripts/check-prerender-head.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = 'dist';

if (!existsSync(DIST)) {
  console.error('[prerender-head] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'index.html') out.push(full);
  }
  return out;
}

const files = walk(DIST).filter((f) => !f.includes(`${sep}assets${sep}`));
if (files.length === 0) {
  console.error('[prerender-head] no index.html found under dist/ - refusing to pass.');
  process.exit(1);
}

const pages = [];
for (const file of files) {
  let route = '/' + relative(DIST, file).split(sep).join('/');
  route = route.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');
  const doc = new JSDOM(readFileSync(file, 'utf8')).window.document;
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const descEl = doc.querySelector('meta[name="description"]');
  pages.push({
    route,
    canonical: canonicalEl ? canonicalEl.getAttribute('href') : null,
    title: (doc.title || '').trim(),
    description: descEl ? (descEl.getAttribute('content') || '').trim() : null,
  });
}

const problems = [];
for (const p of pages) {
  if (!p.canonical) problems.push(`${p.route}: no canonical`);
  else {
    // Compared by PATH rather than by string suffix, so the check does not care
    // which origin the build was configured with and does not have to special-
    // case a trailing slash. The first version compared suffixes and reported
    // the homepage as broken: stripping the trailing slash from
    // "https://host/" leaves "https://host", which ends with no path at all.
    let canonicalPath;
    try {
      canonicalPath = new URL(p.canonical, 'https://placeholder.invalid').pathname;
    } catch {
      canonicalPath = null;
    }
    const normalise = (s) => (s === null ? null : s.replace(/\/+$/, '') || '/');
    if (normalise(canonicalPath) !== normalise(p.route)) {
      problems.push(`${p.route}: canonical points at ${p.canonical}`);
    }
  }
  if (!p.title) problems.push(`${p.route}: no title`);
  if (!p.description) problems.push(`${p.route}: no meta description`);
}

const byTitle = new Map();
for (const p of pages) {
  if (!p.title) continue;
  if (!byTitle.has(p.title)) byTitle.set(p.title, []);
  byTitle.get(p.title).push(p.route);
}
for (const [title, routes] of byTitle) {
  if (routes.length > 1) problems.push(`duplicate title ${JSON.stringify(title.slice(0, 60))} on ${routes.join(', ')}`);
}

console.log(`[prerender-head] ${pages.length} prerendered page(s) checked for canonical, title and description.`);

if (problems.length === 0) {
  console.log('OK Every page declares its own canonical, a unique title and a description.');
  process.exit(0);
}

console.error(`\nX ${problems.length} problem(s):`);
for (const p of problems) console.error(`  ${p}`);
console.error(
  '\n  A page without its own canonical lets the SPA fallback decide, which is how\n' +
    '  every entity URL came to claim it was the homepage. A shared title is a\n' +
    '  duplicate-content signal. See WEB-SEO-002 and WEB-SEO-006.\n',
);
process.exit(1);
