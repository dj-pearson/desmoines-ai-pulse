#!/usr/bin/env node
/**
 * TypeScript error ratchet (WEB-CI-007, extended by WEB-CI-023).
 *
 * WHY A RATCHET RATHER THAN A PASS/FAIL GATE
 * Neither project passes clean today. A gate that always fails teaches everyone
 * to ignore it, and one that is simply absent lets the count drift up. So this
 * compares against a checked-in per-file baseline: the build fails if any file
 * gets WORSE or a new file appears, and it tells you to re-baseline when things
 * get better.
 *
 * WHY PER-FILE AND NOT A SINGLE TOTAL
 * A single number lets one file improve while another silently regresses. Per
 * file, that trade is visible and rejected.
 *
 * TWO PROJECTS
 *   strict — tsconfig.strict.json, the strictNullChecks opt-in list (WEB-CI-007).
 *   app    — tsconfig.app.json, everything the site actually builds.
 *
 * `app` was added because the root `tsconfig.json` is `"files": []` plus project
 * references, so `npm run type-check` (`tsc --noEmit`) compiles ZERO files and
 * has always exited 0. Two P1 crashes shipped through it: /stay called
 * getCanonicalUrl with no import, and useSocialFeatures returned a bare
 * `loading` after an unused-var autofix renamed the binding to `_loading`. Both
 * are one-line TS2304/TS2552 errors that `tsc -p tsconfig.app.json` reports and
 * nothing in CI ever ran.
 *
 * RE-BASELINE ON LINUX ONLY. The `app` baseline is platform-dependent and the
 * gap is large: the same commit reports 0 errors on Windows and 378 in CI.
 * TypeScript resolves module paths case-insensitively on a case-insensitive
 * filesystem, so an import whose case does not match the file on disk
 * compiles locally and fails on Linux, taking every file downstream of it
 * with it. A baseline written on Windows therefore records zero and turns
 * this check permanently red for everyone else - which is exactly what
 * happened on 2026-08-23 and was reverted.
 *
 * If you need to re-baseline, take the numbers from a CI run, or run this
 * inside WSL/Docker. Do not trust a local Windows count.
 *
 * NOTE: `include` does not bound what tsc checks — every transitively imported
 * file is checked too. That is why a baseline covers files not listed as roots.
 *
 * Usage:
 *   node scripts/strict-ratchet.mjs                    # check the strict project
 *   node scripts/strict-ratchet.mjs --project app      # check the app project
 *   node scripts/strict-ratchet.mjs --update           # rewrite the baseline
 *
 * Exit codes: 0 = held or improved, 1 = regressed.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PROJECTS = {
  strict: { tsconfig: 'tsconfig.strict.json', baseline: 'strict-baseline.json' },
  app: { tsconfig: 'tsconfig.app.json', baseline: 'app-type-baseline.json' },
};

const projectArgIndex = process.argv.indexOf('--project');
const projectName = projectArgIndex === -1 ? 'strict' : process.argv[projectArgIndex + 1];
const project = PROJECTS[projectName];
if (!project) {
  console.error(
    `[ratchet] unknown project "${projectName}". Known: ${Object.keys(PROJECTS).join(', ')}`
  );
  process.exit(1);
}

const LABEL = `${projectName}-ratchet`;
const REBASELINE_CMD =
  projectName === 'strict' ? 'npm run type-check:strict:update' : 'npm run type-check:app:update';
const BASELINE = join(ROOT, project.baseline);
const UPDATE = process.argv.includes('--update');

function collectErrors() {
  let output = '';
  try {
    output = execSync(`npx tsc --project ${project.tsconfig} --noEmit`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
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
    `[${LABEL}] baseline written: ${currentTotal} error(s) across ${Object.keys(current).length} file(s).`
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
  `[${LABEL}] ${currentTotal} error(s) across ${Object.keys(current).length} file(s); baseline ${baseline.total}.`
);

if (improvements.length) {
  console.log('\nImproved:');
  for (const i of improvements) {
    console.log(`  ${i.file}: ${i.before} -> ${i.after}`);
  }
}

if (regressions.length) {
  console.error(`\n❌ ${LABEL}: regressions (these files got worse):`);
  for (const r of regressions) {
    const label = r.before === 0 ? 'NEW' : `${r.before} -> ${r.after}`;
    console.error(`  ${r.file}: ${label}`);
  }
  console.error(
    '\nFix the new errors, or if this is a deliberate trade, re-baseline with:\n' +
      `  ${REBASELINE_CMD}`
  );
  process.exit(1);
}

if (currentTotal < baseline.total) {
  console.log(
    `\n✅ Improved by ${baseline.total - currentTotal}. Re-baseline to lock it in:\n` +
      `  ${REBASELINE_CMD}`
  );
} else {
  console.log(`\n✅ ${LABEL}: no regressions.`);
}

process.exit(0);
