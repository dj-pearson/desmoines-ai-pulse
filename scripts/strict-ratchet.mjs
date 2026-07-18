#!/usr/bin/env node
/**
 * strictNullChecks migration ratchet (WEB-CI-007).
 *
 * WHY A RATCHET RATHER THAN A PASS/FAIL GATE
 * tsconfig.strict.json cannot pass today — there are ~88 real null-safety and
 * implicit-any errors across the import graph. A gate that always fails teaches
 * everyone to ignore it, and one that is simply absent lets the count drift up.
 * So this compares against a checked-in per-file baseline: the build fails if
 * any file gets WORSE or a new file appears, and it tells you to re-baseline
 * when things get better.
 *
 * WHY PER-FILE AND NOT A SINGLE TOTAL
 * A single number lets one file improve while another silently regresses. Per
 * file, that trade is visible and rejected.
 *
 * NOTE: `include` in tsconfig.strict.json does not bound what tsc checks — every
 * transitively imported file is checked too. That is exactly why this baseline
 * covers files that are not listed as roots.
 *
 * Usage:
 *   node scripts/strict-ratchet.mjs             # check against the baseline
 *   node scripts/strict-ratchet.mjs --update    # rewrite the baseline (after improving)
 *
 * Exit codes: 0 = held or improved, 1 = regressed.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE = join(ROOT, 'strict-baseline.json');
const UPDATE = process.argv.includes('--update');

function collectErrors() {
  let output = '';
  try {
    output = execSync('npx tsc --project tsconfig.strict.json --noEmit', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // tsc exits non-zero when there are errors — that is the expected path here.
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }

  const counts = {};
  for (const line of output.split('\n')) {
    // e.g. src/hooks/useVoting.ts(42,7): error TS2532: Object is possibly 'undefined'.
    const m = line.match(/^(.+?)\(\d+,\d+\): error TS\d+:/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    counts[file] = (counts[file] || 0) + 1;
  }
  return counts;
}

const current = collectErrors();
const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total: currentTotal, files: current }, null, 2) + '\n'
  );
  console.log(
    `[strict-ratchet] baseline written: ${currentTotal} error(s) across ${Object.keys(current).length} file(s).`
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseFiles = baseline.files || {};

const regressions = [];
const improvements = [];

for (const [file, count] of Object.entries(current)) {
  const before = baseFiles[file] ?? 0;
  if (count > before) regressions.push({ file, before, after: count });
}
for (const [file, before] of Object.entries(baseFiles)) {
  const after = current[file] ?? 0;
  if (after < before) improvements.push({ file, before, after });
}

console.log(
  `[strict-ratchet] ${currentTotal} error(s) across ${Object.keys(current).length} file(s); baseline ${baseline.total}.`
);

if (improvements.length) {
  console.log('\nImproved:');
  for (const i of improvements) {
    console.log(`  ${i.file}: ${i.before} -> ${i.after}`);
  }
}

if (regressions.length) {
  console.error('\n❌ Strict-mode regressions (these files got worse):');
  for (const r of regressions) {
    const label = r.before === 0 ? 'NEW' : `${r.before} -> ${r.after}`;
    console.error(`  ${r.file}: ${label}`);
  }
  console.error(
    '\nFix the new errors, or if this is a deliberate trade, re-baseline with:\n' +
      '  npm run type-check:strict:update'
  );
  process.exit(1);
}

if (currentTotal < baseline.total) {
  console.log(
    `\n✅ Improved by ${baseline.total - currentTotal}. Re-baseline to lock it in:\n` +
      '  npm run type-check:strict:update'
  );
} else {
  console.log('\n✅ No strict-mode regressions.');
}

process.exit(0);
