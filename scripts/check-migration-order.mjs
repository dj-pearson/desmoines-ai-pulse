#!/usr/bin/env node
/**
 * Migration versions are unique, and a new one sorts after everything on the
 * base branch.
 *
 * WHY. supabase db push applies pending migrations in version order and
 * refuses one older than the newest already applied (it needs --include-all,
 * which applies it out of order). The repo holds migrations dated up to two
 * weeks ahead of the calendar, so `supabase migration new` - which stamps
 * today - produces a file that sorts BEFORE ones already on main. That file
 * is either refused at push or silently applied out of order, and review
 * reads the history in the wrong order too.
 *
 * WHAT IT CHECKS.
 *   1. No two files share a version prefix (the ledger is keyed on it).
 *   2. Every migration added relative to the base ref sorts after the base's
 *      newest. Name a new one max+1, not today's date.
 *
 * The base ref is origin/$GITHUB_BASE_REF in a PR, else origin/main. When git
 * cannot see it (a shallow local clone) the second check is skipped with a
 * note, never passed silently.
 *
 *   node scripts/check-migration-order.mjs
 */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'supabase/migrations';
const versionOf = (f) => (f.match(/^(\d+)_/) || [])[1] ?? null;

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.error('[migration-order] no migrations found - refusing to pass.');
  process.exit(1);
}

let failed = false;

const seen = new Map();
for (const f of files) {
  const v = versionOf(f);
  if (!v) continue;
  if (seen.has(v)) {
    console.error(`X duplicate version ${v}: ${seen.get(v)} and ${f}`);
    failed = true;
  } else seen.set(v, f);
}

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
let baseFiles = null;
try {
  baseFiles = execFileSync('git', ['ls-tree', '--name-only', `${base}:${DIR}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .filter((f) => f.endsWith('.sql'));
} catch {
  console.log(`[migration-order] ${base} is not available to git here; skipping the ordering check.`);
}

if (baseFiles) {
  const baseSet = new Set(baseFiles);
  const baseMax = baseFiles.map(versionOf).filter(Boolean).sort().at(-1);
  const added = files.filter((f) => !baseSet.has(f));
  for (const f of added) {
    const v = versionOf(f);
    if (v && baseMax && v <= baseMax) {
      console.error(
        `X ${f} sorts before ${base}'s newest migration (${baseMax}).\n` +
          `  supabase db push refuses an out-of-order version. Rename it to a version after ${baseMax}.`,
      );
      failed = true;
    }
  }
  console.log(`[migration-order] ${files.length} migration(s); ${added.length} new against ${base} (newest there ${baseMax}).`);
}

if (failed) process.exit(1);
console.log('OK Migration versions are unique and new ones sort last.');
