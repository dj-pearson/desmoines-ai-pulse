#!/usr/bin/env node
/**
 * Every migration must parse against Postgres's own grammar (WEB-BE-039).
 *
 * WHY THIS EXISTS. Nothing in this repository could check a migration without a
 * database, so a migration with a SYNTAX ERROR looked exactly like a correct
 * one until someone ran it - and when one did fail, it failed quietly:
 * supabase_migrations.schema_migrations gets its row, the objects do not get
 * created, and the gap surfaces months later as a 42P01 in a hook. That is the
 * shape WEB-QA-018 tracks 29 times over and WEB-QA-005 traces the trip planner
 * to.
 *
 * WHAT IT FOUND ON ITS FIRST RUN, across 389 files in under half a second:
 * 20251203000004_add_location_tracking.sql, `timestamp` as a bare column name
 * in a RETURNS TABLE list. A migration runs in one transaction, so that error
 * rolled back the entire file - the table, the trigger and four functions. It
 * was already in .github/migration-drift-baseline.json as drifted; this is the
 * reason, and nobody had one before.
 *
 * WHAT IT DOES NOT CHECK. Syntax, not semantics: a migration that parses can
 * still reference a table that does not exist, take a lock it should not, or
 * violate the deprecation flow in CLAUDE.md. check-migration-drift covers the
 * first of those. This rules out the one class that is pure loss - a file that
 * cannot run at all.
 *
 * libpg-query is the actual Postgres parser (libpg_query) compiled to WASM, so
 * "parses" means what the server means by it, not what a regex thinks.
 *
 * Exit 0 when every file parses, 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, 'supabase', 'migrations');

if (!existsSync(DIR)) {
  console.log('check-migrations-parse: no supabase/migrations directory, nothing to check.');
  process.exit(0);
}

let pg;
try {
  pg = await import('libpg-query');
} catch {
  // NOT a silent skip. A checker that quietly passes when its engine is absent
  // is the green-check-that-measured-nothing this repo keeps finding; the
  // dependency is in package.json, so a missing one means a broken install.
  console.error(
    '[migrations-parse] libpg-query is not installed. It is a devDependency -\n' +
      'run `npm ci`. Refusing to report success without parsing anything.'
  );
  process.exit(1);
}

// The WASM module must be loaded before parseSync works, and until it is,
// EVERY call throws "WASM module not initialized". A script that counted
// failures without this would report all 389 broken; one that counted
// successes would report none. Load it, and fail loudly if it will not load.
await pg.loadModule();

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const failures = [];

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');
  try {
    // Statement grammar, then the plpgsql bodies inside DO blocks and
    // CREATE FUNCTION - the second catches errors the first cannot see,
    // because to the SQL parser a function body is an opaque string.
    pg.parseSync(src);
    pg.parsePlPgSQLSync(src);
  } catch (error) {
    failures.push({ file, message: String(error?.message ?? error).split('\n')[0] });
  }
}

// Sanity floor. If the glob ever matches nothing - a moved directory, a bad
// cwd - this must not report success over zero files.
if (files.length === 0) {
  console.error('[migrations-parse] found 0 .sql files in supabase/migrations. That is not a pass.');
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`\n[migrations-parse] ${failures.length} migration(s) do not parse:\n`);
  for (const f of failures) console.error(`  ${f.file}\n    ${f.message}`);
  console.error(
    '\nA migration that cannot parse cannot run, and it fails as a rolled-back\n' +
      'transaction rather than an alarm: the ledger records it, the objects never\n' +
      'appear, and the gap shows up later as a 42P01 at runtime.'
  );
  process.exit(1);
}

console.log(`[migrations-parse] ${files.length} migration(s) parse against the Postgres grammar.`);
