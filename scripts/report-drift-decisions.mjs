#!/usr/bin/env node
/**
 * WEB-QA-018 AC1 - the evidence for "re-apply, repair, or retire", per migration.
 *
 * Thirty-one migrations are recorded in supabase_migrations.schema_migrations as
 * applied and produced nothing. `supabase db push` will never run any of them
 * again, so every object they define is permanently absent while the code
 * written against it type-checks, builds and fails only at runtime as an empty
 * state.
 *
 * AC1 asks for a decision per module. Two checks already hold half the answer
 * each and nothing put them together:
 *
 *   check-migration-drift.mjs   which migration defines which missing object
 *   check-schema-usage.mjs      which code references a name that is not there
 *
 * This joins them. For every drifted migration it reports the objects it would
 * create and how much code is waiting on them, so "is this a feature we lost or
 * a file we should delete" is answered with counts rather than by reading
 * thirty-one SQL files.
 *
 * IT DOES NOT DECIDE, AND IT DOES NOT TOUCH THE DATABASE. Re-applying a
 * migration is a production write and stays the owner's action.
 *
 * TWO REFERENCE COUNTS, DELIBERATELY, because each is wrong in a different
 * direction and the decision needs both:
 *
 *   proven    from check-schema-usage --json. Conservative by construction - it
 *             skips select('*'), template-literal selects and dynamic table
 *             names, so it UNDER-counts. A zero here does not mean unused.
 *   textual   a literal search for the object name across src/ and
 *             supabase/functions/. It over-counts - a name in a comment counts -
 *             so it is the safe signal for the one direction that must not be
 *             got wrong: do not retire something that still has readers.
 *   sql       the object named by ANOTHER migration. This one was added after
 *             the first run classified 20251104000000 (the seven GSC helper
 *             functions WEB-SEO-014 is waiting on) and
 *             20250731000001_create_update_coordinates_function as having no
 *             readers. Both are true of TypeScript and false of the database: a
 *             function called by a trigger, by another function, or by a pg_cron
 *             job has no TS caller and is still load-bearing. update_coordinates
 *             is wired by 20250731000002_create_location_triggers.sql, which is
 *             the geocoding trigger CLAUDE.md documents.
 *
 * SO THE SECOND VERDICT IS "NO READERS", NOT "RETIRE". All three counts at zero
 * means nothing this script can see uses the object - which is a place to look,
 * not a conclusion. It cannot see dynamic SQL, RPCs called by name from a
 * client it does not scan, or anything referenced only in the database itself.
 * Anything else is REAPPLY, because the cost of re-applying a migration nothing
 * needed is a few unused objects, and the cost of deleting one something needed
 * is a feature.
 *
 * Offline. Reads scripts/db-snapshot.json via the drift checker and
 * src/integrations/supabase/types.ts via the usage checker; needs no credentials.
 *
 * Usage:
 *   node scripts/report-drift-decisions.mjs            # grouped report
 *   node scripts/report-drift-decisions.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCAN_ROOTS = ['src', 'supabase/functions'];
const MIGRATIONS_DIR = 'supabase/migrations';
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);
const asJson = process.argv.includes('--json');

/**
 * Both checkers exit non-zero to signal findings, which is correct for them and
 * would abort this. Their STDOUT is the payload either way.
 */
function runJson(script, args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through to the throw below */
      }
    }
    throw new Error(`${script} did not produce JSON: ${String(err.message).slice(0, 200)}`);
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

// The generated types name every table in the database, so a missing table
// appears there only if the types are stale - but a missing FUNCTION never
// appears, and counting the types file as a "reader" would make every table look
// used. Excluded from the textual count for that reason.
const EXCLUDED_FROM_TEXTUAL = new Set([join('src', 'integrations', 'supabase', 'types.ts')]);

const TYPES_FILE = join('src', 'integrations', 'supabase', 'types.ts');
const typesSource = existsSync(TYPES_FILE) ? readFileSync(TYPES_FILE, 'utf8') : '';

const files = SCAN_ROOTS.flatMap((root) => walk(root));
const sources = files
  .filter((f) => !EXCLUDED_FROM_TEXTUAL.has(f))
  .map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

/** Whole-word match, so `events` does not count every hit inside `event_photos`. */
export function wordMatcher(name) {
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

function textualRefs(name) {
  const re = wordMatcher(name);
  return sources.filter((s) => re.test(s.text)).map((s) => s.file);
}

// Every migration except the one being judged. A file naming its own object is
// the definition, not a caller.
const migrationSources = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ({ file: f, text: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }))
  : [];

function sqlRefs(name, definedIn) {
  const re = wordMatcher(name);
  return migrationSources.filter((m) => m.file !== definedIn && re.test(m.text)).map((m) => m.file);
}

/**
 * The columns a table HAS, read from the generated types - the deployed truth.
 * Null when the table is not in the schema at all.
 *
 * WHY NOT THE EARLIEST `CREATE TABLE`: because a column added later by
 * `ALTER TABLE ... ADD COLUMN` is reachable, and comparing against the first
 * declaration alone reports it as lost. content_queue.priority is exactly that
 * - added by 20260823000006_content_queue_priority.sql - and the first version
 * of this check named it unreachable.
 */
export function deployedColumns(typesSource, table) {
  const start = typesSource.indexOf(`\n      ${table}: {\n        Row: {\n`);
  if (start < 0) return null;
  const from = typesSource.indexOf('Row: {', start);
  const to = typesSource.indexOf('\n        Insert: {', from);
  if (to < 0) return null;
  return new Set(
    [...typesSource.slice(from, to).matchAll(/^\s+(\w+)\??:/gm)]
      .map((m) => m[1])
      .filter((c) => c !== 'Row'),
  );
}

/**
 * The columns one `CREATE TABLE` declares, from the SQL. Null when the file
 * does not declare that table.
 */
export function declaredColumns(sql, table) {
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s*\\(`,
    'i',
  );
  const m = re.exec(sql);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let body = '';
  for (; i < sql.length && depth > 0; i += 1) {
    const c = sql[i];
    if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) break; }
    body += c;
  }
  const cols = [];
  let d = 0;
  let cur = '';
  const take = () => {
    const w = cur.trim().split(/\s+/)[0];
    if (/^\w+$/.test(w)) cols.push(w);
    cur = '';
  };
  for (const ch of body) {
    if (ch === '(') d += 1;
    else if (ch === ')') d -= 1;
    if (ch === ',' && d === 0) { take(); continue; }
    cur += ch;
  }
  take();
  const constraints = new Set(['UNIQUE', 'PRIMARY', 'FOREIGN', 'CHECK', 'CONSTRAINT', 'EXCLUDE', 'LIKE']);
  return cols.filter((c) => !constraints.has(c.toUpperCase()));
}

/**
 * Declarations in `file` that RE-APPLYING THE MIGRATION WOULD NOT PRODUCE.
 *
 * WHY THIS IS NOT THE SAME QUESTION AS DRIFT (WEB-QA-034). A drifted migration
 * is recorded as applied and produced nothing, and the obvious remedy is to run
 * it again. That remedy is empty for a table an EARLIER migration already
 * created, because every such declaration in this repo is
 * `CREATE TABLE IF NOT EXISTS`: the table exists, so the statement is a no-op
 * now and would be a no-op on every future run. The shape the later migration
 * describes is unreachable by any route except a NEW migration.
 *
 * Found live: 20251203000001_cms_features.sql declares content_queue with
 * article_id, assigned_reviewer, notes and review_deadline, and
 * 20251108000001_admin_features_phase2.sql had already created it with
 * content_type/content_id. A whole CMS review UI was written against the
 * unreachable columns, and this report said REAPPLY.
 *
 * Reported per column, because the two shapes usually overlap: what is lost is
 * the columns the later declaration adds, not the table.
 *
 * @returns {{table: string, guarded: boolean, dropsFirst: boolean,
 *            earlier: string[], unreachableColumns: string[]}[]}
 */
export function shadowedDeclarations(file, sources, typesSource = '') {
  const self = sources.find((m) => m.file === file);
  if (!self) return [];
  const out = [];
  for (const m of self.text.matchAll(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
    const table = m[2];
    const earlier = sources.filter(
      (o) => o.file < file && new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${table}\\b`, 'i').test(o.text),
    );
    if (earlier.length === 0) continue;

    // A DROP before the CREATE makes the recreation real, so it is not shadowed.
    const dropsFirst = new RegExp(`DROP\\s+TABLE[^;]*\\b${table}\\b`, 'i').test(self.text.slice(0, m.index));
    if (dropsFirst) continue;

    const wants = declaredColumns(self.text, table) ?? [];
    // What the table HAS: the generated types when they know it, because a
    // column added by a later ALTER is reachable and the earliest CREATE does
    // not know about it. The first declaration is the fallback.
    const has =
      deployedColumns(typesSource, table) ?? new Set(declaredColumns(earlier[0].text, table) ?? []);
    out.push({
      table,
      guarded: Boolean(m[1]),
      dropsFirst,
      earlier: earlier.map((e) => e.file),
      unreachableColumns: wants.filter((c) => !has.has(c)),
    });
  }
  return out;
}

/**
 * NO-READERS needs ALL THREE counts at zero. The two errors are not symmetric -
 * re-applying a migration nothing needed leaves a few unused objects, deleting
 * one something needed loses a feature - so any single signal is enough to say
 * REAPPLY. Exported and pure so the rule is tested rather than read.
 */
export function verdictFor({ provenTotal = 0, textualFiles = 0, sqlFiles = 0 }) {
  return provenTotal > 0 || textualFiles > 0 || sqlFiles > 0 ? 'REAPPLY' : 'NO-READERS';
}

/**
 * Guarded so the exported rules above can be imported by a test without this
 * spawning two checker subprocesses as a side effect of the import.
 */
function main() {
  const drift = runJson('scripts/check-migration-drift.mjs', ['--json']);
  const usage = runJson('scripts/check-schema-usage.mjs', ['--json', '--all']);

  // check-schema-usage reports a finding per call site, naming the object it could
  // not resolve. Index by lowercased name so the join is case-insensitive the same
  // way Postgres is.
  const provenByName = new Map();
  for (const f of usage.findings ?? usage ?? []) {
    const name = String(f.name ?? '').toLowerCase();
    if (!name) continue;
    if (!provenByName.has(name)) provenByName.set(name, []);
    provenByName.get(name).push(`${f.file}:${f.line}`);
  }

  const rows = drift.drifted.map((d) => {
    const objects = [
      ...d.missingTables.map((n) => ({ kind: 'table', name: n })),
      ...d.missingFunctions.map((n) => ({ kind: 'function', name: n })),
      ...(d.missingColumns ?? []).map((n) => ({ kind: 'column', name: n })),
    ].map((o) => {
      // A column finding is "table.column"; the readers to count are the ones
      // naming the column, since the table itself may well exist.
      const bare = o.kind === 'column' ? o.name.split('.').pop() : o.name;
      const proven = provenByName.get(bare.toLowerCase()) ?? [];
      const textual = textualRefs(bare);
      const sql = sqlRefs(bare, d.file);
      return { ...o, proven, textual, sql };
    });

    const provenTotal = objects.reduce((n, o) => n + o.proven.length, 0);
    const textualFiles = new Set(objects.flatMap((o) => o.textual));
    const sqlFiles = new Set(objects.flatMap((o) => o.sql));

    return {
      file: d.file,
      objects,
      provenTotal,
      textualFiles: [...textualFiles].sort(),
      sqlFiles: [...sqlFiles].sort(),
      verdict: verdictFor({ provenTotal, textualFiles: textualFiles.size, sqlFiles: sqlFiles.size }),
      shadowed: shadowedDeclarations(d.file, migrationSources, typesSource),
    };
  });

  if (asJson) {
    console.log(JSON.stringify({ capturedAt: drift.capturedAt, rows }, null, 2));
    return;
  }

  const reapply = rows.filter((r) => r.verdict === 'REAPPLY');
  const noReaders = rows.filter((r) => r.verdict === 'NO-READERS');

  console.log(
    `[drift-decisions] ${rows.length} drifted migration(s) against a schema snapshot from ${drift.capturedAt}.`,
  );
  console.log(
    '[drift-decisions] proven = check-schema-usage call sites (under-counts). ' +
      'textual = files naming the object (over-counts).\n',
  );

  console.log(`REAPPLY  (${reapply.length}) - code is waiting on these objects`);
  for (const r of reapply.sort((a, b) => b.provenTotal - a.provenTotal || b.textualFiles.length - a.textualFiles.length)) {
    console.log(
      `  ${r.file}\n    ${r.objects.length} object(s), ${r.provenTotal} proven call site(s), ${r.textualFiles.length} file(s) naming them`,
    );
    for (const o of r.objects.filter((o) => o.proven.length || o.textual.length || o.sql.length).slice(0, 6)) {
      const where = o.proven.length
        ? o.proven.slice(0, 3).join(', ')
        : o.textual.length
          ? `${o.textual.length} file(s): ${o.textual.slice(0, 2).join(', ')}`
          : `SQL only: ${o.sql.slice(0, 2).join(', ')}`;
      console.log(`      ${o.kind.padEnd(8)} ${o.name.padEnd(38)} ${where}`);
    }
    const quiet = r.objects.filter((o) => !o.proven.length && !o.textual.length && !o.sql.length).length;
    if (quiet) console.log(`      (${quiet} further object(s) with no readers - they ride along with this file)`);
  }

  console.log(
    `\nNO READERS  (${noReaders.length}) - nothing in src/, supabase/functions/ or another migration names ` +
      'any object they define.\n  A place to look, not a conclusion: dynamic SQL, pg_cron job bodies and ' +
      'database-internal callers are all invisible to a static scan.',
  );
  for (const r of noReaders) {
    console.log(`  ${r.file}`);
    console.log(`    ${r.objects.map((o) => `${o.name} (${o.kind})`).join(', ')}`);
  }

  // Printed LAST and separately, because it does not change a verdict - it
  // changes whether the obvious remedy for that verdict does anything.
  const shadowed = rows.filter((r) => r.shadowed.some((sd) => sd.unreachableColumns.length));
  if (shadowed.length) {
    console.log(
      `\nRE-APPLYING WILL NOT PRODUCE THESE  (${shadowed.length}) - an earlier migration already ` +
        'created the table, and every declaration below is CREATE TABLE IF NOT EXISTS.\n' +
        '  The statement is a no-op now and on every future run. These columns need a NEW ' +
        'migration, not this one again.',
    );
    for (const r of shadowed) {
      console.log(`  ${r.file}  [${r.verdict}]`);
      for (const sd of r.shadowed.filter((x) => x.unreachableColumns.length)) {
        console.log(
          `    ${sd.table}: ${sd.unreachableColumns.join(', ')}\n` +
            `      already created by ${sd.earlier[0]}`,
        );
      }
    }
  }

  console.log(
    `\n[drift-decisions] ${reapply.length} with readers, ${noReaders.length} with none that this script can see, ` +
      `${shadowed.length} carrying a declaration re-applying cannot produce. ` +
      'Re-applying is a production write and is not this script\'s to make.',
  );
}

// process.argv[1] is undefined under `node -e`, which is how the import-only
// smoke check runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
