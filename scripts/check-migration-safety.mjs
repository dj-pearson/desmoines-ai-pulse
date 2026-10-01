/**
 * WEB-DB-008: migration-safety linter.
 *
 * Scans NEW migrations (those not grandfathered in
 * `.github/migration-safety-baseline.json`) for destructive single-release
 * changes that violate the Backward Compatibility rules in CLAUDE.md, and fails
 * (exit 1) when found — unless the `MIGRATION_SAFETY_OVERRIDE` env is truthy
 * (CI sets this when a PR carries the `migration-override` label).
 *
 * Detected (data-destructive / shape-breaking in a single release):
 *   DROP COLUMN, DROP TABLE, DROP TYPE, RENAME COLUMN/TABLE,
 *   ALTER COLUMN ... SET NOT NULL, tightened CHECK (ADD CHECK / ADD CONSTRAINT
 *   ... CHECK), and DROP FUNCTION (RPC signature change).
 *
 * Idempotent object churn that is normally safe (DROP INDEX/POLICY/TRIGGER,
 * DROP FUNCTION IF EXISTS used purely to recreate) is intentionally NOT flagged.
 *
 * Usage: node scripts/check-migration-safety.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const MIGRATIONS_DIR = 'supabase/migrations';
const BASELINE_PATH = '.github/migration-safety-baseline.json';

const RULES = [
  { id: 'drop-column', re: /\bDROP\s+COLUMN\b/i, msg: 'DROP COLUMN removes data older clients may still read' },
  { id: 'drop-table', re: /\bDROP\s+TABLE\b/i, msg: 'DROP TABLE removes a table older clients may still read' },
  { id: 'drop-type', re: /\bDROP\s+TYPE\b/i, msg: 'DROP TYPE removes an enum/type older clients may still use' },
  { id: 'rename-column', re: /\bRENAME\s+COLUMN\b/i, msg: 'RENAME COLUMN drops the old name from the client POV' },
  { id: 'rename-table', re: /\bALTER\s+TABLE\s+\S+\s+RENAME\s+TO\b/i, msg: 'RENAME TABLE drops the old name from the client POV' },
  { id: 'set-not-null', re: /\bSET\s+NOT\s+NULL\b/i, msg: 'Adding NOT NULL to an existing column rejects rows old clients write' },
  { id: 'add-check', re: /\bADD\s+(CONSTRAINT\s+\S+\s+)?CHECK\b/i, msg: 'A new/tightened CHECK can reject values old clients send' },
  { id: 'drop-function', re: /\bDROP\s+FUNCTION\b(?!\s+IF\s+EXISTS)/i, msg: 'DROP FUNCTION (without IF EXISTS) changes/removes an RPC signature old clients call' },
];

function loadGrandfathered() {
  try {
    return new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).grandfathered ?? []);
  } catch {
    console.warn(`[migration-safety] no baseline at ${BASELINE_PATH} — scanning ALL migrations`);
    return new Set();
  }
}

/** Strip line/block comments so a pattern inside a comment doesn't false-positive. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const grandfathered = loadGrandfathered();
let files;
try {
  files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
} catch {
  console.log('[migration-safety] no migrations directory — nothing to check');
  process.exit(0);
}

/**
 * SCAN WHAT THIS CHANGE ADDS, not everything since the baseline. The check ran
 * over every migration missing from the grandfathered list, so the moment one
 * merged with the migration-override label - the documented way to accept a
 * reviewed destructive change - every later PR failed on it, including PRs
 * that touched no SQL. Six such migrations were failing every PR on
 * 2026-09-30. With the base branch visible to git, only the files this change
 * adds are scanned; the override label then means what it says. Without it
 * (a local run, a shallow clone) the old, stricter scope applies.
 */
function baseMigrations() {
  const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  try {
    const out = execFileSync('git', ['ls-tree', '--name-only', `${base}:${MIGRATIONS_DIR}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { base, files: new Set(out.split('\n').filter((f) => f.endsWith('.sql'))) };
  } catch {
    return null;
  }
}
const onBase = baseMigrations();
const toScan = files.filter((f) => !grandfathered.has(f) && !(onBase && onBase.files.has(f)));
console.log(
  onBase
    ? `[migration-safety] ${toScan.length} migration(s) added against ${onBase.base} to scan`
    : `[migration-safety] ${toScan.length} new migration(s) to scan (${grandfathered.size} grandfathered; base branch not visible, scanning all)`,
);

const findings = [];
for (const f of toScan) {
  const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  for (const rule of RULES) {
    if (rule.re.test(sql)) findings.push({ file: f, rule: rule.id, msg: rule.msg });
  }
}

if (findings.length === 0) {
  console.log('✅ No destructive single-release changes in new migrations.');
  process.exit(0);
}

console.error('\n❌ Destructive migration change(s) detected:');
for (const x of findings) console.error(`   - ${x.file}: [${x.rule}] ${x.msg}`);
console.error('\nPer CLAUDE.md Backward Compatibility, split these across releases');
console.error('(add the new shape first, migrate readers, retire the old shape later).');

if (String(process.env.MIGRATION_SAFETY_OVERRIDE || '').toLowerCase() === 'true') {
  console.error('\n⚠️  MIGRATION_SAFETY_OVERRIDE set (migration-override label) — allowing despite findings.');
  process.exit(0);
}
console.error('\nIf this is genuinely safe/intended, add the `migration-override` label to the PR.');
process.exit(1);
