#!/usr/bin/env node
/**
 * Offline checks for the shared sitemap slug shapes (WEB-SEO-011).
 *
 *   npx tsx scripts/__tests__/sitemap-slugs.test.mjs
 *
 * These functions decide two things that have to agree: the URL the generator
 * WRITES into sitemap-events.xml, and the URL check-sitemap-freshness.ts looks
 * for when it asks which events are missing from the live file. Sharing the
 * module makes them agree by construction; these checks pin what they agree ON.
 *
 * The timezone case is the one that matters. Most events are in the evening, and
 * a Des Moines evening is the NEXT day in UTC - so slugging from the raw
 * timestamp puts tomorrow's date in today's URL, for most of the corpus.
 */
import { spawnSync } from 'node:child_process';

/**
 * IT RE-EXECS ITSELF UNDER TZ=UTC, and that is not tidiness.
 *
 * createEventSlug converts to Central and then reads getFullYear/getMonth/getDate,
 * which are the HOST's local fields. On a machine already in America/Chicago the
 * conversion is a no-op, so the timezone assertions below pass whether or not it
 * happens - verified by deleting the toZonedTime call and watching every check
 * still go green on a Central developer machine. GitHub runners are UTC, so CI
 * had teeth and local runs did not, which is the worst way round.
 */
if (process.env.TZ !== 'UTC') {
  // execArgv carries the tsx loader registration. Without it the child cannot
  // import a .ts module and dies with ERR_UNKNOWN_FILE_EXTENSION.
  const r = spawnSync(process.argv[0], [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, TZ: 'UTC' },
  });
  process.exit(r.status ?? 1);
}

const { createEventSlug, createSlug, CENTRAL_TIMEZONE } = await import('../lib/sitemapSlugs.ts');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

console.log('createSlug');
check('lowercases and hyphenates', createSlug('Chef George\'s Steak Bar') === 'chef-george-s-steak-bar');
check('collapses runs of separators', createSlug('A  --  B') === 'a-b');
check('trims leading and trailing hyphens', createSlug('!!Hello!!') === 'hello');

console.log('\ncreateEventSlug: the date suffix is Central, not UTC');
{
  // 01:00Z on the 29th is 20:00 on the 28th in Des Moines. Slugging from the raw
  // timestamp would put the 29th in the URL, and the app links to the 28th.
  const slug = createEventSlug('Karaoke Fridays', { date: '2026-08-29T01:00:00Z' });
  check('an evening event keeps the Central day', slug === 'karaoke-fridays-2026-08-28', slug);
}
{
  const slug = createEventSlug('Matinee', { date: '2026-08-28T18:00:00Z' });
  check('a daytime event is unaffected', slug === 'matinee-2026-08-28', slug);
}
{
  // The generator selects both columns and prefers the explicit UTC start.
  const slug = createEventSlug('Show', { date: '2026-08-20T18:00:00Z', event_start_utc: '2026-08-29T01:00:00Z' });
  check('event_start_utc wins over date', slug === 'show-2026-08-28', slug);
}

console.log('\ncreateEventSlug: falls back rather than throwing');
check('no event object', createEventSlug('Bare Title') === 'bare-title');
check('null date', createEventSlug('Bare Title', { date: null }) === 'bare-title');
{
  const slug = createEventSlug('Bad Date', { date: 'not-a-date' });
  // A whole sitemap generation must not fail on one bad row; the bare title slug
  // is wrong but recoverable, and the freshness check will report it missing.
  check('unparseable date degrades to the title slug', slug === 'bad-date', slug);
}

console.log('\nconstants');
check('Central timezone is America/Chicago', CENTRAL_TIMEZONE === 'America/Chicago', CENTRAL_TIMEZONE);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
