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
 *   shadowed...   a drifted migration's obvious remedy is to run it again, and
 *                 for a table an EARLIER migration already created that remedy
 *                 is empty: every such declaration here is CREATE TABLE IF NOT
 *                 EXISTS, so it is a no-op now and on every future run. Saying
 *                 REAPPLY about one of those sends somebody to re-run a
 *                 migration that will change nothing (WEB-QA-034).
 */
import {
  verdictFor,
  wordMatcher,
  declaredColumns,
  deployedColumns,
  shadowedDeclarations,
} from '../report-drift-decisions.mjs';

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

console.log('\ndeclaredColumns: the columns one CREATE TABLE declares');
{
  const sql = `CREATE TABLE IF NOT EXISTS public.q (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('a','b')),
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    UNIQUE(article_id, status)
  );`;
  const cols = declaredColumns(sql, 'q');
  check('reads every column', JSON.stringify(cols) === JSON.stringify(['id', 'article_id', 'status', 'priority']), JSON.stringify(cols));
  // A CHECK with a comma inside it, and a table-level UNIQUE, are the two
  // shapes that turn a naive split into nonsense columns.
  check('a comma inside CHECK(...) is not a column boundary', !cols.includes('b'));
  check('a table-level constraint is not a column', !cols.includes('UNIQUE'));
  check('an unknown table is null', declaredColumns(sql, 'other') === null);
}

console.log('\ndeployedColumns: what the table HAS, from the generated types');
{
  const types = [
    '      widgets: {',
    '        Row: {',
    '          id: string',
    '          label: string | null',
    '        }',
    '        Insert: {',
    '          id?: string',
    '        }',
  ].join('\n');
  const cols = deployedColumns('\n' + types, 'widgets');
  check('reads the Row block', cols && cols.has('id') && cols.has('label') && cols.size === 2);
  check('stops at Insert', !(cols ?? new Set()).has('Insert'));
  check('an unknown table is null', deployedColumns('\n' + types, 'gadgets') === null);
}

console.log('\nshadowedDeclarations: what re-applying would NOT produce');
{
  const earlier = { file: '20240101000000_first.sql', text: 'CREATE TABLE IF NOT EXISTS public.q (id UUID, content_type TEXT);' };
  const later = {
    file: '20240202000000_second.sql',
    text: 'CREATE TABLE IF NOT EXISTS public.q (id UUID, article_id UUID, notes TEXT);',
  };
  const sources = [earlier, later];
  const [row] = shadowedDeclarations(later.file, sources);
  check('reports the shadowed table', row && row.table === 'q');
  check('names only the columns the earlier one lacks', row && JSON.stringify(row.unreachableColumns) === JSON.stringify(['article_id', 'notes']), JSON.stringify(row?.unreachableColumns));
  check('records which file already created it', row && row.earlier[0] === earlier.file);
  check('the earlier file is not itself shadowed', shadowedDeclarations(earlier.file, sources).length === 0);

  // A DROP first makes the recreation REAL, so it is not shadowed.
  const dropping = {
    file: '20240303000000_third.sql',
    text: 'DROP TABLE IF EXISTS public.q CASCADE;\nCREATE TABLE public.q (id UUID, fresh TEXT);',
  };
  check('a DROP before the CREATE is not shadowed', shadowedDeclarations(dropping.file, [earlier, dropping]).length === 0);

  // The deployed types win over the earliest declaration, because a column
  // added by a later ALTER is reachable. content_queue.priority is exactly
  // that, and the first version of this check called it unreachable.
  const types = '\n      q: {\n        Row: {\n          id: string\n          content_type: string\n          notes: string | null\n        }\n        Insert: {\n';
  const [withTypes] = shadowedDeclarations(later.file, sources, types);
  check(
    'a column the types already have is not reported',
    withTypes && JSON.stringify(withTypes.unreachableColumns) === JSON.stringify(['article_id']),
    JSON.stringify(withTypes?.unreachableColumns),
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
