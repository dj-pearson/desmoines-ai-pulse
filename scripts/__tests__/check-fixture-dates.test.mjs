#!/usr/bin/env node
/**
 * WEB-QA-041: the matcher behind scripts/check-fixture-dates.mjs.
 *
 * The first case is the literal that broke the required smoke lane: an
 * opening_date a few weeks ahead in a spec that never pins the clock.
 */
import { findDateBombs, stripComments } from '../check-fixture-dates.mjs';

const TODAY = '2026-10-15';

const cases = [
  ['the 2026-11-01 opening that rotted', `  opening_date: '2026-11-01',`, 1],
  ['a timestamp counts by its day', `  event_start_utc: '2027-03-01T19:00:00Z',`, 1],
  ['today is not the future', `  date: '2026-10-15',`, 0],
  ['the past stays past', `  opening_date: '2025-03-03',`, 0],
  ['a 2099 sentinel is deliberate', `const FUTURE = '2099-01-01T00:00:00Z';`, 0],
  ['a file that pins the clock is skipped', `await page.clock.setFixedTime(new Date('2026-09-25T18:00:00Z'));\nconst d = '2026-11-01';`, 0],
  ['a comment naming the date is not a fixture', `// the literal '2026-11-01' went stale\nconst d = centralDay(30);`, 0],
  ['a block comment naming the date is not a fixture', `/* was '2026-11-01' */ const d = centralDay(30);`, 0],
  [
    'a route glob is not a block comment',
    `page.route('**/auth/v1/**', f);\nawait page.clock.setFixedTime(NOW);\npage.route('**/rest/v1/x**', g);\nconst d = '2026-11-01';`,
    0,
  ],
  ['a URL is not a line comment', `const u = 'https://example.com/2026-11-01';`, 1],
  ['a version string is not a date', `const v = '12026-11-01';`, 0],
];

let failed = 0;
for (const [name, text, want] of cases) {
  const got = findDateBombs(text, TODAY).length;
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (want ${want}, got ${got})`);
  if (!ok) failed++;
}

// Line numbers survive comment stripping, so the report points at the line.
const multi = `/**\n * header\n */\nconst a = 1;\nconst d = '2026-12-01';`;
const lineOk = findDateBombs(multi, TODAY)[0]?.line === 5 && stripComments(multi).split('\n').length === 5;
console.log(`${lineOk ? 'PASS' : 'FAIL'}  reports the source line after stripping a block comment`);
if (!lineOk) failed++;

const total = cases.length + 1;
console.log(`\n${total - failed}/${total} passed.`);
process.exit(failed ? 1 : 0);
