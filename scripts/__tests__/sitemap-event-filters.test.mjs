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
 *
 * The same three writers produce sitemap-restaurants.xml, and the restaurants
 * read is held to one filter the same way (WEB-BE-045). regenerate-sitemaps,
 * the 6-hourly job that overwrites the storage copy and pings IndexNow with
 * the rows that changed, read restaurants with no filter at all, so a merged
 * duplicate or a place closed for good (both noindex pages) was published and,
 * the moment the hours refresh marked it CLOSED_PERMANENTLY, submitted for a
 * crawl. The other two dropped status 'closed' but not the two legacy
 * spellings the restaurant page also reads as closed.
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

/** A table's query: from .from('<table>') to the end of its chain. */
function tableQuery(raw, table) {
  // Comments first: they carry semicolons, and the slice ends at the first one.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const start = src.search(new RegExp(`\\.from\\(["']${table}["']\\)`));
  if (start === -1) return '';
  const end = src.indexOf(';', start);
  return src.slice(start, end === -1 ? undefined : end);
}

for (const file of WRITERS) {
  const query = tableQuery(readFileSync(file, 'utf8'), 'events');
  check(`${file}: has an events query`, query.length > 0);
  for (const [name, re] of PREDICATES) check(`${file}: ${name}`, re.test(query));
  check(`${file}: no bare date >= today cutoff`, !/\.gte\(["']date["']/.test(query));
}

// Every spelling src/lib/restaurantHours.ts (PERMANENTLY_CLOSED_STATUSES) and
// RestaurantDetails' lifecycleOf read as closed for good, so as noindex.
const CLOSED_FOR_GOOD = 'status.is.null,status.not.in.(closed,permanently_closed,closed_permanently)';
const RESTAURANT_PREDICATES = [
  ['merged rows excluded', /\.neq\(["']is_merged["'], true\)/],
  ['closed-for-good statuses excluded, NULL kept', new RegExp(`\\.or\\(["']${CLOSED_FOR_GOOD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\)`)],
  ['Google CLOSED_PERMANENTLY excluded, NULL kept', /\.or\(["']business_status\.is\.null,business_status\.neq\.CLOSED_PERMANENTLY["']\)/],
];

for (const file of WRITERS) {
  const query = tableQuery(readFileSync(file, 'utf8'), 'restaurants');
  check(`${file}: has a restaurants query`, query.length > 0);
  for (const [name, re] of RESTAURANT_PREDICATES) check(`${file}: restaurants ${name}`, re.test(query));
  check(`${file}: restaurants no bare status.neq.closed`, !/status\.neq\.closed/.test(query));
}

// WEB-FEAT-103: the service-role writers read past the RLS policy that hides
// an admin-hidden restaurant from the anon key (which the build-time script
// uses, so the policy covers it), so they filter it themselves.
for (const file of WRITERS.filter((f) => f.startsWith('supabase/functions/'))) {
  const query = tableQuery(readFileSync(file, 'utf8'), 'restaurants');
  check(`${file}: restaurants hidden rows excluded`, /\.is\(["']hidden_at["'], null\)/.test(query));
}

check('scripts/generate-sitemap.js is gone', !existsSync('scripts/generate-sitemap.js'));
check('CLAUDE.md does not tell anyone to run it', !/generate-sitemap\.js/.test(readFileSync('CLAUDE.md', 'utf8')));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
