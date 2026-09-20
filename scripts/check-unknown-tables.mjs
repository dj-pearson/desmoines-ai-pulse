#!/usr/bin/env node
/**
 * `supabase.from()` may only name a relation the generated types know
 * (WEB-CI-031 AC2).
 *
 * WHY THIS IS A CI CONCERN AND NOT A STYLE ONE. `from()` is overloaded once per
 * relation in the generated Database type - 252 tables plus 18 views. A string
 * literal it knows matches one overload and the chain instantiates once. A name
 * it does not know matches none, so overload resolution falls back across all
 * 270 and every downstream .select()/.eq()/.order() is re-instantiated over a
 * 270-member SelectQueryError union.
 *
 * Measured on src/components/cms/EnhancedArticleEditor.tsx, three such names:
 *     as committed   check 104.10s   7,850,532 instantiations
 *     via the helper check   3.28s     364,674 instantiations
 * Nine files were 91% of the whole app type-check, and every one of them
 * queried a relation absent from types.ts. That cost is why
 * `npm run type-check` has been a no-op against a "files": [] root for two P1
 * crashes (WEB-CI-030).
 *
 * TWO RULES, both absolute, and the SECOND ONE IS THE POINT.
 *
 *  1. An unknown relation goes through fromUnknownTable().
 *
 *  2. A KNOWN relation must NOT. The helper hands back an untyped builder, so
 *     using it on a table the types describe silences real column checking to
 *     save nothing - the known name was already one overload. This rule is what
 *     keeps rule 1 from becoming a way to turn off type-checking, and it is
 *     also the migration path: when a relation gets a migration and the types
 *     are regenerated, this check fails on its name and tells you to move the
 *     callers back.
 *
 * `supabase.storage.from()` names a STORAGE BUCKET, not a relation, and is
 * skipped - it is a different overload set with no cost.
 *
 * Usage: node scripts/check-unknown-tables.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TYPES_FILE = 'src/integrations/supabase/types.ts';
const HELPER_FILE = 'src/integrations/supabase/unknownTable.ts';
const ROOT = 'src';

const types = readFileSync(TYPES_FILE, 'utf8');

/** Relation names under one section of the generated Database type. */
function namesIn(label, next) {
  const a = types.indexOf(`    ${label}: {`);
  const b = types.indexOf(`\n    ${next}: {`, a);
  if (a < 0 || b < 0) return null;
  return [...types.slice(a, b).matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
}

const tables = namesIn('Tables', 'Views');
const views = namesIn('Views', 'Functions');
if (!tables || !views) {
  console.error(`[unknown-tables] could not read Tables/Views out of ${TYPES_FILE} - has the shape changed?`);
  process.exit(1);
}
const known = new Set([...tables, ...views]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__pycache__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

// `supabase.from('x')`, allowing the newline the formatter puts before .from.
// The `supabase` receiver is required, which is what excludes
// `supabase.storage.from('bucket')` and any other builder's .from().
const TYPED_FROM = /supabase\s*\n?\s*\.from\(\s*(['"])([a-z0-9_]+)\1\s*\)/g;
const HELPER_FROM = /fromUnknownTable\(\s*(['"])([a-z0-9_]+)\1\s*\)/g;

const problems = [];
let checkedFiles = 0;
let helperSites = 0;
let typedSites = 0;

for (const file of walk(ROOT)) {
  const rel = relative('.', file).split(sep).join('/');
  if (rel === HELPER_FILE) continue;
  const text = readFileSync(file, 'utf8');
  checkedFiles += 1;

  const lineOf = (index) => text.slice(0, index).split('\n').length;

  for (const m of text.matchAll(TYPED_FROM)) {
    typedSites += 1;
    if (known.has(m[2])) continue;
    problems.push(
      `${rel}:${lineOf(m.index)} supabase.from('${m[2]}') names a relation the generated types do not have. ` +
        'Use fromUnknownTable() - the unmatched overload re-instantiates the whole chain over a 270-member union.',
    );
  }

  for (const m of text.matchAll(HELPER_FROM)) {
    helperSites += 1;
    if (!known.has(m[2])) continue;
    problems.push(
      `${rel}:${lineOf(m.index)} fromUnknownTable('${m[2]}') names a relation the types DO have. ` +
        'Use supabase.from() so the columns are checked - the helper returns an untyped builder and would save nothing here.',
    );
  }
}

if (problems.length > 0) {
  console.error('\nX A Supabase query is on the wrong side of the typed/untyped line:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `[unknown-tables] ${checkedFiles} file(s): ${typedSites} typed from() call(s) all name one of ${known.size} known relations, ` +
    `and ${helperSites} untyped call(s) name none of them.`,
);
