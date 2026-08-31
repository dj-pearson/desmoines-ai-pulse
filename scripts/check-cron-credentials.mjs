#!/usr/bin/env node
/**
 * A scheduled job written from now on must read its credentials from Vault, not
 * from the dead app.settings.* GUCs (SEO-023).
 *
 * WHY THIS IS A GATE AND check-cron-targets IS A REPORT: an undeployed target is
 * fixed by a deploy, outside the repo, so failing on it would block every PR on
 * somebody else's action. This one is fixed by editing the SQL in the same
 * commit that introduces it, so failing the build costs nothing and catches the
 * defect at the only moment it is cheap.
 *
 * The failure mode it blocks, from 20260826000002: Supabase removed
 * app.settings.supabase_url / app.settings.service_role_key and refuses
 * ALTER DATABASE ... SET on both, so current_setting() over them cannot be made
 * to return a value. 48 of 62 jobs failed on every run since creation. Probed
 * again on 2026-08-31 and both still read NULL, so this is not historical.
 *
 * It also blocks the quieter half. current_setting('...', true) returns NULL
 * rather than raising, 'Bearer ' || NULL is NULL, jsonb_build_object drops the
 * key, and the POST goes out unauthenticated - pg_cron records SUCCESS because
 * enqueueing worked, and the 401 lands where no one is watching.
 *
 * IT ONLY LOOKS FORWARD, deliberately. 64 migrations older than the Vault switch
 * still contain the dead GUC and always will: they are applied history, they are
 * never re-run, and 20260826000002 already rewrote the live cron.job rows off it
 * with cron.alter_job. Editing those files would change nothing in any database
 * and would make this check a 64-line wall nobody reads. The cutoff is the Vault
 * migration itself - after it, there is no excuse.
 *
 * OFFLINE. Reads supabase/migrations/*.sql. No database, no network.
 *
 *   node scripts/check-cron-credentials.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/** The migration that moved cron credentials into Vault. Everything at or after
 *  this version is held to the new mechanism. */
const VAULT_MIGRATION = '20260826000002';

if (!existsSync(MIGRATIONS)) {
  console.error('[cron-credentials] supabase/migrations not found - refusing to pass.');
  process.exit(1);
}

/** The GUCs the platform no longer defines and no longer lets anyone define. */
const DEAD_GUC = /current_setting\(\s*'app\.settings\.(supabase_url|service_role_key)'/gi;

/**
 * Blank out -- line comments and block comments, preserving newlines so line
 * numbers still point at the right place. Without this, a migration explaining
 * why the GUC is dead trips the check that enforces it.
 */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// A scan that read nothing is not a clean result; several checks in this repo
// have reported success while looking at zero inputs.
if (files.length === 0) {
  console.error('[cron-credentials] no .sql files in supabase/migrations - refusing to pass.');
  process.exit(1);
}

const inScope = files.filter((f) => f.slice(0, VAULT_MIGRATION.length) >= VAULT_MIGRATION);

if (inScope.length === 0) {
  console.error(
    `[cron-credentials] no migration at or after ${VAULT_MIGRATION} - the cutoff is wrong, refusing to pass.`,
  );
  process.exit(1);
}

const offenders = [];
let scheduling = 0;

for (const file of inScope) {
  const raw = readFileSync(join(MIGRATIONS, file), 'utf8');
  const sql = stripComments(raw);

  // Only migrations that actually schedule work.
  if (!/cron\.schedule\s*\(/i.test(sql)) continue;
  scheduling++;

  const lines = raw.split('\n');
  for (const hit of sql.matchAll(DEAD_GUC)) {
    const line = sql.slice(0, hit.index).split('\n').length;
    offenders.push({ file, line, text: lines[line - 1].trim() });
  }
}

console.log(
  `[cron-credentials] ${inScope.length} migration(s) at or after ${VAULT_MIGRATION}, ` +
    `${scheduling} of them call cron.schedule; ${offenders.length} credential read(s) ` +
    `use a GUC that cannot hold a value.`,
);

if (offenders.length === 0) {
  console.log('OK Every job scheduled since the Vault switch reads its credentials from Vault.');
  process.exit(0);
}

for (const o of offenders) {
  console.error(`\n  ${o.file}:${o.line}`);
  console.error(`    ${o.text}`);
}

console.error(
  "\nReplace each with public.app_secret('supabase_url') / public.app_secret('service_role_key')." +
    '\nSee supabase/migrations/20260826000002_cron_secrets_via_vault.sql for why.',
);
process.exit(1);
