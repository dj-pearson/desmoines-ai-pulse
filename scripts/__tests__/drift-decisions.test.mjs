#!/usr/bin/env node
/**
 * Offline checks for the drift decision rules (WEB-QA-018 AC1).
 *
 *   npx tsx scripts/__tests__/drift-decisions.test.mjs
 *
 * The report itself reads two other checkers and is exercised by running it.
 * These are the two rules underneath, and both have an asymmetric cost:
 *
 *   verdictFor    saying NO-READERS about a migration something needs points at
 *                 deleting a live feature. Saying REAPPLY about a dead one costs
 *                 a few unused objects. So ANY signal must be enough for REAPPLY.
 *   wordMatcher   a substring match would count `events` as a reader of
 *                 `event_photos` and make every migration look used, which
 *                 silently disables the whole report.
 */
import { verdictFor, wordMatcher } from '../report-drift-decisions.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

console.log('verdictFor: any single reader is enough');
check('no readers anywhere', verdictFor({}) === 'NO-READERS');
check('a proven call site', verdictFor({ provenTotal: 1 }) === 'REAPPLY');
check('a textual reference only', verdictFor({ textualFiles: 1 }) === 'REAPPLY');
// The signal that was missing on the first run: the seven GSC helper functions
// and update_coordinates have no TypeScript caller and are still load-bearing,
// because a trigger in another migration calls them.
check('a SQL reference only', verdictFor({ sqlFiles: 1 }) === 'REAPPLY');
check('all three', verdictFor({ provenTotal: 3, textualFiles: 2, sqlFiles: 1 }) === 'REAPPLY');

console.log('\nwordMatcher: whole words, so one table is not counted as a reader of another');
check('matches the name itself', wordMatcher('events').test('.from("events")'));
check('does not match a longer name containing it', !wordMatcher('events').test('.from("event_photos")'));
check('does not match a prefix', !wordMatcher('trip_plans').test('trip_plans_archive'));
check('matches inside a SQL statement', wordMatcher('update_coordinates').test('EXECUTE FUNCTION update_coordinates();'));
check('matches a column name after a dot', wordMatcher('nlp_parsed').test('search_analytics.nlp_parsed'));
// A regex metacharacter in an object name must be escaped, not compiled.
check('escapes regex metacharacters rather than throwing', wordMatcher('a.b').test('a.b') && !wordMatcher('a.b').test('axb'));

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
