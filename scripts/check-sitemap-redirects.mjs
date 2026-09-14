#!/usr/bin/env node
/**
 * The sitemaps and public/_redirects have to agree (WEB-SEO-013 AC7).
 *
 * Two directions, both of which have already gone wrong once here.
 *
 * 1. A SITEMAPPED URL THAT REDIRECTS. Submitting a URL that answers 301 is a
 *    Search Console error ("Page with redirect"), it spends crawl budget to
 *    learn nothing, and the redirect target gets the crawl second-hand. Nothing
 *    prevented it: the redirect list is hand-edited and the entity sitemaps are
 *    generated from the database, so the two are written by different processes
 *    that have never been compared. Ten of the twelve rules today are slug
 *    repairs of the form /restaurants/caf- -> /restaurants/cafe, which is
 *    exactly the shape that reappears the next time a name carries an accent.
 *
 * 2. A REDIRECT TARGET IN NO SITEMAP. This is the one that was actually true.
 *    /things-to-do/tourists was 301'd to /visitors-guide under WEB-UX-016
 *    because the generated pSEO page duplicated the hand-built one - and the
 *    page that WON that duplication was in no sitemap and no prerender list, so
 *    a crawler following the redirect arrived at a JS-only page nothing
 *    declared. The redirect was the whole reason the target mattered and it was
 *    the one page nothing pointed at.
 *
 * IT GATES, unlike check-sitemap-freshness. Both conditions are decided
 * entirely by files in this repo - no live data, no wall-clock race, no
 * deploy state - so a failure is always a real defect a commit introduced and
 * never the weather. Green on the tree it landed on: 1,183 sitemapped paths, 12
 * rules, zero of direction 1 and zero of direction 2.
 *
 * SPA fallback rules (`/* /index.html 200`) are not redirects and are skipped;
 * only 301/302/307/308 count.
 *
 *   node scripts/check-sitemap-redirects.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const REDIRECTS = join(PUBLIC, '_redirects');

const norm = (p) => {
  const stripped = p.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
};

if (!existsSync(REDIRECTS)) {
  console.log('[sitemap-redirects] public/_redirects not found - nothing to compare.');
  process.exit(0);
}

/** 301/302/307/308 rules only. A `200` rule is a rewrite, which serves content in place. */
const rules = readFileSync(REDIRECTS, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/))
  .filter((p) => p.length >= 3 && /^30[1278]$/.test(p[2]))
  .map((p) => ({ from: norm(p[0]), to: norm(p[1]), code: p[2] }));

// WEB-SEO-038: index files are excluded by CONTENT, not by name. This read
// `f !== 'sitemap-index.xml'` - a hardcoded exception for the duplicate index
// that story deleted, which would have silently stopped excluding anything the
// moment the file was renamed. An index lists sitemaps, not pages, so its
// <loc> values are not sitemapped paths.
const allSitemapFiles = readdirSync(PUBLIC).filter((f) => /^sitemap.*\.xml$/.test(f));
const isIndexFile = (name) =>
  /<sitemapindex[\s>]/i.test(readFileSync(join(PUBLIC, name), 'utf8'));
const sitemaps = allSitemapFiles.filter((f) => !isIndexFile(f));
if (sitemaps.length === 0) {
  console.error('[sitemap-redirects] no sitemaps in public/. Did generate-sitemaps run?');
  process.exit(1);
}

/** path -> the sitemap that lists it. */
const listed = new Map();
for (const file of sitemaps) {
  for (const m of readFileSync(join(PUBLIC, file), 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let path;
    try {
      path = norm(new URL(m[1]).pathname);
    } catch {
      continue;
    }
    if (!listed.has(path)) listed.set(path, file);
  }
}

console.log(`[sitemap-redirects] ${listed.size} sitemapped paths against ${rules.length} redirect rule(s).`);

// Direction 1: submitted URLs that redirect.
// A wildcard source (/old/*) cannot be compared path-for-path, so it is reported
// separately rather than guessed at.
const wildcard = rules.filter((r) => r.from.includes('*'));
const submitted = rules.filter((r) => !r.from.includes('*') && listed.has(r.from));

// Direction 2: redirect targets that no sitemap lists. External targets and
// wildcard/placeholder targets are out of scope.
//
// So are the sitemaps themselves (WEB-SEO-038). A sitemap is not a page and
// must never appear inside another sitemap - listing sitemap.xml as a URL
// would submit the index for indexing. Redirecting a retired sitemap path to
// the live one is therefore correct AND permanently "orphaned" by this rule,
// which is the checker being wrong rather than the redirect.
const orphanTargets = rules.filter(
  (r) =>
    !r.to.includes('*') &&
    !/^https?:/i.test(r.to) &&
    !/^\/sitemap[\w-]*\.xml$/i.test(r.to) &&
    !listed.has(r.to),
);

/**
 * WEB-SEO-038: exactly one sitemap index in public/.
 *
 * public/sitemap-index.xml was a hand copy of the generated public/sitemap.xml,
 * still deployed, still stamped 2026-03-16 on seven of its eight children while
 * the generated one said 2026-08-31. Two indexes on one domain is two answers
 * to "what should I crawl", and whichever Search Console was given, the stale
 * copy said nothing on this site had changed since March. It is a copy-paste
 * away from returning, and nothing would have noticed.
 */
const indexFiles = allSitemapFiles.filter(isIndexFile);

let failed = false;

if (submitted.length > 0) {
  failed = true;
  console.error('\nSitemapped URLs that answer with a redirect:\n');
  for (const r of submitted) {
    console.error(`  ${listed.get(r.from).padEnd(26)} ${r.from}  ->  ${r.to}  (${r.code})`);
  }
  console.error(
    '\nSearch Console reports these as "Page with redirect" and the crawl is spent\n' +
      'learning the URL moved. Remove the URL from its sitemap, or drop the redirect\n' +
      'if the URL is meant to be canonical.\n',
  );
}

if (indexFiles.length !== 1) {
  failed = true;
  console.error(
    `\n${indexFiles.length} sitemap index file(s) in public/: ${indexFiles.join(', ') || 'none'}\n`,
  );
  console.error(
    'Exactly one file in public/ may contain <sitemapindex>. Two indexes give a\n' +
      'crawler two answers about what to crawl, and the one nobody regenerates goes\n' +
      'stale silently - which is how a copy stamped 2026-03-16 stayed deployed for\n' +
      'five months. Delete the extra and 301 its path to /sitemap.xml.\n',
  );
}

if (orphanTargets.length > 0) {
  failed = true;
  console.error('\nRedirect targets that appear in no sitemap:\n');
  for (const r of orphanTargets) {
    console.error(`  ${r.from}  ->  ${r.to}`);
  }
  console.error(
    '\nA 301 exists because the target is the page that should win. If nothing\n' +
      'submits it, the only way a crawler reaches it is by following the redirect\n' +
      'from a URL we have asked it to forget. Add the target to a sitemap (and to\n' +
      'PRERENDER_ROUTES if it is a hub), or drop the redirect.\n',
  );
}

if (wildcard.length > 0) {
  console.log(`\n${wildcard.length} wildcard rule(s) not compared path-for-path:`);
  for (const r of wildcard) console.log(`  ${r.from} -> ${r.to} (${r.code})`);
}

if (failed) process.exit(1);

console.log('\nOK No sitemapped URL redirects, and every redirect target is submitted.');
