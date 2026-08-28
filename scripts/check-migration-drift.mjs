/**
 * WEB-QA-017: ledger drift - migrations recorded as applied that produced nothing.
 *
 * `supabase_migrations.schema_migrations` is the only record of what ran. A row
 * there is what stops `supabase db push` from ever running that file again. If a
 * row was written without the SQL taking effect, the migration is permanently
 * skipped and every object it defines stays missing - while the code written
 * against those objects type-checks, compiles, and fails only at runtime as an
 * empty state.
 *
 * That is not hypothetical here. Sixteen ledgered migrations create 57 tables
 * that do not exist in production, and two of them contain SQL that cannot parse
 * at all (a `timestamp` column name unquoted; TG_OP inside a CREATE TRIGGER WHEN
 * clause), which proves the rows were written without the files executing.
 *
 * IT CHECKS THREE KINDS OF OBJECT, and the third was added because the first two
 * missed a whole shape: a migration that only ever runs ALTER TABLE ... ADD
 * COLUMN creates no relation and no function, so a checker looking for those
 * finds nothing to report and calls the migration clean. Two such migrations
 * were drifted and invisible until columns were checked
 * (20251220200000_add_user_behavior_tracking,
 * 20251220200001_enhance_recommendation_metadata). That is the WEB-BE-034 defect
 * exactly: a column several call sites use, that is not there.
 *
 * OFFLINE. It reads scripts/db-snapshot.json, so CI needs no credentials.
 * Refresh that file when production schema changes:
 *
 *   psql "$SUPABASE_DB_URL" -At -c "
 *     select json_build_object(
 *       'capturedAt', to_char(now() at time zone 'utc','YYYY-MM-DD'),
 *       'ledger',    (select coalesce(json_agg(version order by version),'[]'::json)
 *                       from supabase_migrations.schema_migrations),
 *       'relations', (select coalesce(json_agg(distinct c.relname),'[]'::json)
 *                       from pg_class c join pg_namespace n on n.oid=c.relnamespace
 *                      where n.nspname='public' and c.relkind in ('r','v','m','p','f')),
 *       'functions', (select coalesce(json_agg(distinct p.proname),'[]'::json)
 *                       from pg_proc p where p.pronamespace='public'::regnamespace),
 *       'columns',   (select coalesce(json_agg(distinct table_name||'.'||column_name),'[]'::json)
 *                       from information_schema.columns where table_schema='public'))"
 *
 * A stale snapshot under-reports, which is why capturedAt is printed every run.
 *
 * RATCHETS, it does not gate. The 16 known migrations are listed in
 * .github/migration-drift-baseline.json because each needs its own decision
 * (WEB-QA-018): re-apply, repair, or delete the file and the UI above it. A NEW
 * drifted migration exits 1 - that is the case worth blocking, because it means
 * a push has just recorded work it did not do.
 *
 * Usage: node scripts/check-migration-drift.mjs [--all] [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const SNAPSHOT_PATH = 'scripts/db-snapshot.json';
const BASELINE_PATH = '.github/migration-drift-baseline.json';
const showAll = process.argv.includes('--all');
// --json emits the drifted set for scripts/report-drift-decisions.mjs, so the
// migration-side analysis lives here once rather than being re-derived there.
const asJson = process.argv.includes('--json');

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`check-migration-drift: ${SNAPSHOT_PATH} is missing. See the header for the refresh command.`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const ledger = new Set(snapshot.ledger);
const relations = new Set(snapshot.relations);
const functions = new Set(snapshot.functions);
const columns = new Set(snapshot.columns ?? []);
const baseline = existsSync(BASELINE_PATH)
  ? new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).migrations)
  : new Set();

// A bare CREATE TABLE keyword run, so `CREATE TABLE IF NOT EXISTS public."x"` and
// `CREATE UNLOGGED TABLE x` both yield `x`. Comments are stripped first: several
// migrations carry a prose "-- CREATE TABLE for ..." that would otherwise parse.
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const TABLE_RE = /CREATE\s+(?:UNLOGGED\s+|GLOBAL\s+|LOCAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const FUNC_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\s*\.\s*)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
// Words the regex can land on when the statement is not actually a create.
const NOT_A_NAME = new Set(['if', 'not', 'exists', 'only', 'public', 'for', 'is', 'as', 'temp', 'temporary', 'unlogged']);

const collect = (sql, re) => {
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (!NOT_A_NAME.has(name)) names.add(name);
  }
  return names;
};

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const sources = new Map(files.map((f) => [f, stripComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))]));

// An object absent from production is only drift if nothing later removed it on
// purpose. A table created in migration A and dropped in migration Z is the
// system working; counting it would bury the real signal under decade-old churn.
const removedLaterBy = (name, afterFile) => {
  // `name` always matches [a-z_][a-z0-9_]* (see collect), so it needs no escaping.
  const re = new RegExp(
    String.raw`\bDROP\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION)\s+(?:IF\s+EXISTS\s+)?(?:public\s*\.\s*)?"?${name}"?\b` +
      String.raw`|\bALTER\s+(?:TABLE|FUNCTION)\s+(?:IF\s+EXISTS\s+)?(?:public\s*\.\s*)?"?${name}"?\s+RENAME\b`,
    'i'
  );
  return files.some((f) => f > afterFile && re.test(sources.get(f)));
};

// ADD COLUMN drift is a separate question from CREATE drift and needs asking
// separately. Two of the migrations below create no table and no function at
// all - they only add columns to tables that already exist - so a check that
// looks for missing relations and missing functions cannot see them, and did
// not. A ledgered migration whose ALTER TABLE never ran leaves exactly the
// defect WEB-BE-034 was: a column several call sites use, that is not there.
//
// Only columns on a table that DOES exist are considered. Where the table is
// missing too, the table is the finding and repeating every one of its columns
// would bury it.
const columnsAddedBy = (sql) => {
  const added = [];
  const alter = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?([\s\S]*?);/gi;
  let m;
  while ((m = alter.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    if (NOT_A_NAME.has(table)) continue;
    const add = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
    let c;
    while ((c = add.exec(m[2])) !== null) {
      const col = c[1].toLowerCase();
      if (!NOT_A_NAME.has(col)) added.push([table, col]);
    }
  }
  return added;
};

const columnRemovedLaterBy = (table, column, afterFile) => {
  const re = new RegExp(
    String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?"?${table}"?[\s\S]*?\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?${column}"?\b` +
      String.raw`|\bRENAME\s+COLUMN\s+"?${column}"?\b`,
    'i'
  );
  return files.some((f) => f > afterFile && re.test(sources.get(f)));
};

const drifted = [];
for (const file of files) {
  const version = file.split('_')[0];
  if (!ledger.has(version)) continue; // not applied yet - `db push` will still run it
  const sql = sources.get(file);
  const missingTables = [...collect(sql, new RegExp(TABLE_RE.source, 'gi'))]
    .filter((t) => !relations.has(t) && !removedLaterBy(t, file));
  const missingFunctions = [...collect(sql, new RegExp(FUNC_RE.source, 'gi'))]
    .filter((f) => !functions.has(f) && !removedLaterBy(f, file));
  const missingColumns = columnsAddedBy(sql)
    .filter(([t, c]) => relations.has(t) && !columns.has(`${t}.${c}`) && !columnRemovedLaterBy(t, c, file))
    .map(([t, c]) => `${t}.${c}`);
  if (missingTables.length || missingFunctions.length || missingColumns.length) {
    drifted.push({ file, version, missingTables, missingFunctions, missingColumns, known: baseline.has(file) });
  }
}

const fresh = drifted.filter((d) => !d.known);
const known = drifted.filter((d) => d.known);

if (asJson) {
  console.log(JSON.stringify({ capturedAt: snapshot.capturedAt, drifted }, null, 2));
  process.exit(fresh.length ? 1 : 0);
}

console.log(
  `check-migration-drift: ${ledger.size} ledgered migrations against a schema snapshot from ${snapshot.capturedAt} ` +
    `(${relations.size} relations, ${functions.size} functions).`
);

const report = (d) => {
  console.log(`  ${d.file}`);
  if (d.missingTables.length) console.log(`    tables never created:    ${d.missingTables.join(', ')}`);
  if (d.missingFunctions.length) console.log(`    functions never created: ${d.missingFunctions.join(', ')}`);
  if (d.missingColumns?.length) console.log(`    columns never added:     ${d.missingColumns.join(", ")}`);
};

if (fresh.length) {
  console.log(`\nNEW LEDGER DRIFT (${fresh.length})`);
  fresh.forEach(report);
  console.log(
    `\nEach of these is recorded as applied, so \`supabase db push\` will never run it again.\n` +
      `Either apply it by hand and re-capture the snapshot, or fix the migration and repair the ledger row.`
  );
}

if (known.length) {
  if (showAll) {
    console.log(`\nKNOWN DRIFT (${known.length}) - baselined in ${BASELINE_PATH}, owned by WEB-QA-018`);
    known.forEach(report);
  } else {
    const tables = known.reduce((n, d) => n + d.missingTables.length, 0);
    console.log(`\n${known.length} known drifted migration(s) suppressed by ${BASELINE_PATH} - ${tables} table(s). Run with --all to see them.`);
  }
}

if (!drifted.length) console.log('\nNo ledger drift: every ledgered migration produced the objects it defines.');

process.exit(fresh.length ? 1 : 0);
