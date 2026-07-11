/**
 * WEB-CI-005: PR dependency-vulnerability gate.
 *
 * Runs `npm audit --json`, then FAILS (exit 1) if any high/critical advisory
 * exists on a package that is NOT in `.github/audit-allowlist.json`. Pre-existing
 * accepted advisories are allowlisted there (with a remediation note), so this
 * gate blocks only NEW high/critical advisories introduced by a PR.
 *
 * Usage: node scripts/audit-check.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);

function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync('.github/audit-allowlist.json', 'utf8'));
    return new Set(raw.acceptedPackages ?? []);
  } catch {
    console.warn('[audit-check] no allowlist found — treating every high/critical as blocking');
    return new Set();
  }
}

function runAudit() {
  try {
    // npm audit exits non-zero when vulnerabilities exist; capture stdout anyway.
    return execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return e.stdout || '';
  }
}

const allowlist = loadAllowlist();
let report;
try {
  report = JSON.parse(runAudit());
} catch {
  console.error('[audit-check] could not parse npm audit output');
  process.exit(1);
}

const vulns = report.vulnerabilities ?? {};
const blocking = [];
for (const [name, info] of Object.entries(vulns)) {
  if (!BLOCKING.has(info.severity)) continue;
  if (allowlist.has(name)) continue;
  blocking.push({ name, severity: info.severity });
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(`npm audit totals: ${JSON.stringify(counts)}`);

if (blocking.length === 0) {
  console.log('✅ No new high/critical advisories outside the allowlist.');
  process.exit(0);
}

console.error('❌ New high/critical advisories (not allowlisted):');
for (const b of blocking) console.error(`   - ${b.name} (${b.severity})`);
console.error('\nFix by upgrading the dependency, or — if genuinely accepted —');
console.error('add it to .github/audit-allowlist.json with a remediation note.');
process.exit(1);
