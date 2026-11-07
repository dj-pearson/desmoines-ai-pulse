#!/usr/bin/env node
/**
 * Offline checks for the generated /llms.txt (SEO-047).
 *
 *   npx tsx scripts/__tests__/llms-txt.test.mjs
 *
 * The hand-kept file drifted ("500+ monthly events" against ~340 in the table).
 * These pin that numbers come only from the counts passed in, that a missing
 * count is dropped rather than guessed, and that the build runs the generator.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { renderLlmsTxt, upcomingMonthSlugs, parseMonthSlug } = await import('../lib/llmsTxt.ts');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://desmoinesinsider.com';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

const counts = { upcomingEvents: 317, openRestaurants: 457, attractions: 22, playgrounds: 48, articles: 12 };

test('every count appears exactly as given, with no rounded "N+" claims', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts, monthSlugs: [] });
  assert.match(out, /As of 2026-10-01 the site lists 317 upcoming events, 457 restaurants, 22 attractions, 48 playgrounds and 12 local articles\./);
  assert.doesNotMatch(out, /\d\+/);
});

test('a count that could not be read is left out, not guessed', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts: { ...counts, attractions: null }, monthSlugs: [] });
  assert.match(out, /457 restaurants, attractions, 48 playgrounds/);
});

test('links are absolute on the given base, and month pages are listed', () => {
  const out = renderLlmsTxt({ baseUrl: `${BASE}/`, asOf: '2026-10-01', counts, monthSlugs: ['october-2026'] });
  assert.match(out, /\[October 2026 events\]\(https:\/\/desmoinesinsider\.com\/events\/october-2026\)/);
  assert.doesNotMatch(out, /\]\(\//, 'no root-relative links');
  assert.doesNotMatch(out, /com\/\//, 'no double slash');
});

test('no hand-maintenance comment survives', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts, monthSlugs: [] });
  assert.doesNotMatch(out, /<!--/);
});

test('month slugs: past months dropped, chronological, capped', () => {
  const got = upcomingMonthSlugs(
    ['january-2027', 'september-2026', 'october-2026', 'december-2026', 'november-2026', 'february-2027', 'notamonth-2026'],
    { year: 2026, month: 10 },
  );
  assert.deepEqual(got, ['october-2026', 'november-2026', 'december-2026', 'january-2027']);
  assert.equal(parseMonthSlug('today'), null);
});

// WEB-SEO-052. The hub list was written once and fourteen hubs shipped after it.
// Read the committed sitemaps so the check needs no database.
const sitemapPaths = (file) =>
  [...readFileSync(join(ROOT, 'public', file), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    new URL(m[1]).pathname.replace(/\/+$/, '') || '/',
  );
const STATIC_PATHS = sitemapPaths('sitemap-static.xml');
const linkedPaths = (out) =>
  [...out.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => new URL(m[1]).pathname.replace(/\/+$/, '') || '/');

// Single-segment static pages that are deliberately not in llms.txt, each with
// the reason. Adding a hub to sitemap-static.xml means adding it to llms.txt or
// here; the test below fails until one of the two happens.
const NOT_LISTED = new Map([
  ['/', 'the file itself describes the home page'],
  ['/contact', 'site admin, not local content'],
  ['/advertise', 'advertiser sales page'],
  ['/business-partnership', 'advertiser sales page'],
  ['/submit-event', 'a form'],
  ['/privacy-policy', 'legal'],
  ['/terms', 'legal'],
  ['/map', 'an interactive map with no readable listing'],
  ['/trip-planner', 'an interactive AI tool with no readable content'],
]);

test('every top-level hub in sitemap-static.xml is linked or named as excluded', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts, monthSlugs: [] });
  const linked = new Set(linkedPaths(out));
  const missing = STATIC_PATHS.filter((p) => p.split('/').length === 2 && !linked.has(p) && !NOT_LISTED.has(p));
  assert.deepEqual(missing, [], `hubs in sitemap-static.xml missing from llms.txt: ${missing.join(', ')}`);
});

test('exclusions name pages that still exist, so the list cannot rot', () => {
  const stale = [...NOT_LISTED.keys()].filter((p) => !STATIC_PATHS.includes(p));
  assert.deepEqual(stale, [], `NOT_LISTED entries no longer in sitemap-static.xml: ${stale.join(', ')}`);
});

test('every page link resolves to a URL some sitemap submits', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts, monthSlugs: [] });
  // Feeds are files, not pages; they are in no sitemap by design.
  const pages = linkedPaths(out).filter((p) => !/\.(xml|ics)$/.test(p));
  const known = new Set([...STATIC_PATHS, ...sitemapPaths('sitemap-guides.xml'), ...sitemapPaths('sitemap-articles.xml')]);
  const dead = pages.filter((p) => !known.has(p));
  assert.deepEqual(dead, [], `llms.txt links to pages no sitemap submits: ${dead.join(', ')}`);
});

test('the suburb pattern names only suburbs that have an events page', () => {
  const out = renderLlmsTxt({ baseUrl: BASE, asOf: '2026-10-01', counts, monthSlugs: [] });
  const line = out.split('\n').find((l) => l.startsWith('- Events by suburb:'));
  assert.ok(line, 'suburb line present');
  const slugs = line.split('e.g. ')[1].split(', ').map((s) => s.trim());
  const dead = slugs.filter((s) => !STATIC_PATHS.includes(`/events/${s}`));
  assert.deepEqual(dead, [], `suburbs with no /events/<suburb> in sitemap-static.xml: ${dead.join(', ')}`);
});

test('npm run build generates llms.txt before vite build', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /generate-llms-txt.*vite build/);
});

if (failures > 0) {
  console.error(`\n${failures} llms.txt check(s) failed.`);
  process.exit(1);
}
console.log('\nAll llms.txt checks passed.');
