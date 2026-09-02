#!/usr/bin/env node
/**
 * Fail the build when a sitemap advertises the same URL twice (WEB-SEO-017 AC3).
 *
 * Measured against production 2026-08-27: sitemap-events.xml carried 413 <loc>
 * entries for 397 distinct URLs and sitemap-playgrounds 69 for 67. A URL listed
 * twice does not rank twice. It makes the file disagree with its own count, and
 * it advertises a duplication problem to the one audience most likely to act on
 * it.
 *
 * generate-dynamic-sitemaps.ts now collapses repeats in the single function
 * every generator funnels through, so the checked-in files are clean today.
 * This exists because that is not the only writer: scripts/generate-sitemap.js
 * and the regenerate-sitemaps edge function also produce these files, and a
 * dedupe in one writer is not a guarantee about the artifact.
 *
 * DEDUPING IS NOT A FIX FOR THE DUPLICATE ROWS behind the repeats. See
 * WEB-SEO-017 for the crawler-side cause. This checks the artifact only.
 *
 * Exit 0 clean, 1 on any repeat.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');
const LOC = /<loc>\s*([^<]+?)\s*<\/loc>/g;

function locsIn(xml) {
  const out = [];
  let m;
  LOC.lastIndex = 0;
  while ((m = LOC.exec(xml)) !== null) out.push(m[1]);
  return out;
}

const files = readdirSync(PUBLIC_DIR)
  .filter((f) => /^sitemap.*\.xml$/.test(f))
  .sort();

if (files.length === 0) {
  // Not an error: the generators run inside `npm run build`, and this check can
  // legitimately run before them.
  console.log('check-sitemap-duplicates: no sitemap files in public/, nothing to check.');
  process.exit(0);
}

let failures = 0;
/** url -> the sitemaps that list it, for the cross-file check below. */
const across = new Map();

for (const file of files) {
  const xml = readFileSync(join(PUBLIC_DIR, file), 'utf8');
  const locs = locsIn(xml);

  const counts = new Map();
  for (const loc of locs) {
    counts.set(loc, (counts.get(loc) ?? 0) + 1);
    if (!across.has(loc)) across.set(loc, new Set());
    across.get(loc).add(file);
  }

  const repeated = [...counts].filter(([, n]) => n > 1);
  const distinct = counts.size;

  if (repeated.length > 0) {
    failures++;
    const extra = repeated.reduce((n, [, c]) => n + c - 1, 0);
    console.error(
      `\n✗ ${file}: ${locs.length} <loc> entries for ${distinct} distinct URLs ` +
        `(${repeated.length} URL(s) repeated, ${extra} extra entr(ies))`,
    );
    for (const [loc, n] of repeated.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.error(`    x${n}  ${loc}`);
    }
    if (repeated.length > 10) console.error(`    ...and ${repeated.length - 10} more`);
  } else {
    console.log(`  ok  ${file}: ${distinct} distinct URLs`);
  }
}

// The index legitimately lists the other sitemaps, so it is excluded from the
// cross-file comparison -- otherwise every child sitemap's own URL would look
// like a duplicate of the index entry pointing at it.
const INDEXES = new Set(['sitemap.xml', 'sitemap-index.xml']);

/**
 * Overlaps that are deliberate on BOTH sides, with the reason.
 *
 * An allowlist rather than skipping the cross-file check entirely: a URL claimed
 * by two generators is normally a real ownership bug, and the point of the check
 * is that a NEW one fails.
 *
 * /guides is in sitemap-static.xml because scripts/prerender-routes.mjs states
 * the invariant "every route here must also appear in public/sitemap-static.xml"
 * and /guides is prerendered. It is in sitemap-guides.xml because WEB-SEO-003
 * found the hub was being DROPPED from that file the moment one published guide
 * existed -- and the hub is the only URL in it that serves its own document;
 * every /guides/:slug returns the prerendered homepage to a JS-less crawler.
 * Both reasons are load-bearing, so the overlap stays.
 */
const KNOWN_OVERLAPS = new Map([
  ['/guides', 'prerender invariant (sitemap-static) + WEB-SEO-003 hub inclusion (sitemap-guides)'],
]);

const pathOf = (loc) => {
  try {
    return new URL(loc).pathname.replace(/\/$/, '') || '/';
  } catch {
    return loc;
  }
};

const allShared = [...across]
  .map(([loc, set]) => [loc, [...set].filter((f) => !INDEXES.has(f))])
  .filter(([, inFiles]) => inFiles.length > 1);

const known = allShared.filter(([loc]) => KNOWN_OVERLAPS.has(pathOf(loc)));
const shared = allShared.filter(([loc]) => !KNOWN_OVERLAPS.has(pathOf(loc)));

for (const [loc, inFiles] of known) {
  console.log(`  ok  ${pathOf(loc)} in ${inFiles.join(' + ')} -- ${KNOWN_OVERLAPS.get(pathOf(loc))}`);
}

if (shared.length > 0) {
  failures++;
  console.error(`\n✗ ${shared.length} URL(s) appear in more than one sitemap:`);
  for (const [loc, inFiles] of shared.slice(0, 10)) {
    console.error(`    ${loc}\n        ${inFiles.join(', ')}`);
  }
  if (shared.length > 10) console.error(`    ...and ${shared.length - 10} more`);
}

if (failures > 0) {
  console.error(
    '\nA repeated <loc> means two rows slug to the same URL, or two generators ' +
      'claim the same page. Fix the rows or the ownership, not the XML.\n',
  );
  process.exit(1);
}

console.log(`\ncheck-sitemap-duplicates: ${files.length} sitemap(s), no repeated URLs.\n`);
