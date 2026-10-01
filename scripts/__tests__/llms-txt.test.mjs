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

test('npm run build generates llms.txt before vite build', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /generate-llms-txt.*vite build/);
});

if (failures > 0) {
  console.error(`\n${failures} llms.txt check(s) failed.`);
  process.exit(1);
}
console.log('\nAll llms.txt checks passed.');
