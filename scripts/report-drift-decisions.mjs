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

  console.log(
    `\n[drift-decisions] ${reapply.length} with readers, ${noReaders.length} with none that this script can see. ` +
      'Re-applying is a production write and is not this script\'s to make.',
  );
}

// process.argv[1] is undefined under `node -e`, which is how the import-only
// smoke check runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
