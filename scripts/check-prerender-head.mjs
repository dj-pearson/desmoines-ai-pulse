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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { walkPrerenderedPages } from './prerender-output.mjs';

const DIST = 'dist';

/**
 * Head fields, read without building a DOM.
 *
 * WHY NOT jsdom, WHICH THIS USED TO USE. It was written when dist/ held 35 hub
 * routes. Entity prerendering came on afterwards and dist/ now holds over a
 * thousand pages, so the run died with "FATAL ERROR: Reached heap limit
 * Allocation failed - JavaScript heap out of memory" and exit 134 - in CI too,
 * at pr-checks.yml, where it has therefore been asserting nothing at all.
 *
 * window.close() does NOT fix it: measured both ways across dist/ and both run
 * out of heap, so jsdom cannot process this many documents in one process.
 * check-dom-budget.mjs had the same failure and the same remedy.
 *
 * PROVEN EQUIVALENT rather than assumed - compared field for field against jsdom
 * on 121 pages sampled across the whole of dist/, hubs and every entity type,
 * and matched exactly on all 121. Two things that run caught, both of which a
 * looser parser gets wrong:
 *
 *   - the attribute delimiter must be the SAME quote that opened it. Matching
 *     ["'] at both ends truncates any description containing an apostrophe,
 *     which is most of them ("Discover what's happening ...").
 *   - jsdom decodes entities, so &amp; has to become & before comparing.
 */
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function attrValue(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}=(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? decodeEntities(m[2]) : null;
}

function readHead(html) {
  const end = html.indexOf('</head>');
  const head = end === -1 ? html : html.slice(0, end);
  const canonicalTag = head.match(/<link\b[^>]*\brel=(["'])canonical\1[^>]*>/i);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descTag = head.match(/<meta\b[^>]*\bname=(["'])description\1[^>]*>/i);
  return {
    canonical: canonicalTag ? attrValue(canonicalTag[0], 'href') : null,
    title: titleTag ? decodeEntities(titleTag[1]).trim() : '',
    description: descTag ? (attrValue(descTag[0], 'content') ?? '').trim() : null,
  };
}

if (!existsSync(DIST)) {
  console.error('[prerender-head] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const pageFiles = walkPrerenderedPages(DIST);
if (pageFiles.length === 0) {
  console.error('[prerender-head] no prerendered HTML found under dist/ - refusing to pass.');
  process.exit(1);
}

const pages = [];
for (const { file, route } of pageFiles) {
  pages.push({ route, ...readHead(readFileSync(file, 'utf8')) });
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
