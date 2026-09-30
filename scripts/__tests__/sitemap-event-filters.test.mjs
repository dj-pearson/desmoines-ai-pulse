#!/usr/bin/env node
/**
 * Every writer of sitemap-events.xml applies the same event filter.
 *
 *   npx tsx scripts/__tests__/sitemap-event-filters.test.mjs
 *
 * Three code paths write that file: the build (generate-dynamic-sitemaps.ts)
 * and two edge functions. They disagreed. regenerate-sitemaps had no date
 * cutoff and no is_merged filter, so it submitted every past event and would
 * have submitted each merged duplicate as a soft-404 the moment WEB-SEO-017's
 * ten groups were merged. generate-sitemaps filtered `date >= today`, which
 * dropped a festival or an exhibit still running. A fourth writer,
 * scripts/generate-sitemap.js, overwrote the sitemap INDEX with four URLs and
 * CLAUDE.md told people to run it; it is deleted.
 */
import { readFileSync, existsSync } from 'node:fs';

const WRITERS = [
  'scripts/generate-dynamic-sitemaps.ts',
  'supabase/functions/regenerate-sitemaps/index.ts',
  'supabase/functions/generate-sitemaps/index.ts',
];

const PREDICATES = [
  ['still running counts (end_date)', /\.or\(`date\.gte\.\$\{[^}]+\},end_date\.gte\.\$\{[^}]+\}`\)/],
  ['merged rows excluded', /\.neq\(["']is_merged["'], true\)/],
  ['hidden rows excluded', /\.neq\(["']is_hidden["'], true\)/],
  ['archived rows excluded', /\.is\(["']archived_at["'], null\)/],
];

let failures = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
};

/** The events query: from .from('events') to the end of its chain. */
function eventsQuery(raw) {
  // Comments first: they carry semicolons, and the slice ends at the first one.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const start = src.search(/\.from\(["']events["']\)/);
  if (start === -1) return '';
  const end = src.indexOf(';', start);
  return src.slice(start, end === -1 ? undefined : end);
}

for (const file of WRITERS) {
  const query = eventsQuery(readFileSync(file, 'utf8'));
  check(`${file}: has an events query`, query.length > 0);
  for (const [name, re] of PREDICATES) check(`${file}: ${name}`, re.test(query));
  check(`${file}: no bare date >= today cutoff`, !/\.gte\(["']date["']/.test(query));
}

check('scripts/generate-sitemap.js is gone', !existsSync('scripts/generate-sitemap.js'));
check('CLAUDE.md does not tell anyone to run it', !/generate-sitemap\.js/.test(readFileSync('CLAUDE.md', 'utf8')));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
