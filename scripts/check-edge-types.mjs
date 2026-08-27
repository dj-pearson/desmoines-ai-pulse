/**
 * Edge-function type ratchet (WEB-BE-032 / WEB-QA-001).
 *
 * `npm run type-check:edge` is a CLEAN gate over supabase/functions/_shared/,
 * which is at zero errors. This is the other half: the same compiler over ALL
 * of supabase/functions, as a per-file ratchet, because the ~120 individual
 * function directories cannot reach zero today and a gate that starts red is
 * one this repo has already had to switch off twice (WEB-CI-020, WEB-CI-021).
 *
 * WHY BOTH. assign-role/index.ts imported a name _shared/cors.ts does not
 * export. Deno throws on that at MODULE LOAD, so a deployed function could not
 * start and every role assignment through it failed. It was found by running
 * the clean gate wide as a one-off measurement, not by the gate itself, because
 * assign-role is not in _shared/. Nothing else covers it: check-imports has
 * ROOTS of src/ only, tsconfig.json excludes supabase/, and eslint runs no
 * type-aware rules there.
 *
 * strictNullChecks is ON here and OFF in tsconfig.edge.json, deliberately.
 * With it off, TypeScript cannot narrow a discriminated union on `ok: true |
 * false`, so 57 correct uses of ClaudeTextResult report as errors. A ratchet
 * whose baseline is over a third fabricated teaches people to ignore it. The
 * cost is 18 genuine "possibly null" findings that are baselined rather than
 * fixed.
 *
 * SHIM ARTIFACTS ARE IN THE BASELINE AND ARE NOT DEFECTS. The remote modules
 * are declared as `any` in supabase/functions/_typecheck/remote.d.ts, so
 * anything that needs their real shapes reports an error:
 *   TS2503  Cannot find namespace 'Stripe'      - Stripe.Checkout.Session used as a type
 *   TS2688  Cannot find type definition file    - an esm.sh subpath import
 *   TS2614  no exported member                  - a default-vs-named import of a remote module
 *   TS2347  Untyped function calls may not accept type arguments
 * Improving the shim would clear them. Do not read them as findings.
 *
 * KEYED PER FILE, not per line. A line-keyed baseline is invalidated by any
 * edit above a recorded entry, which check-discarded-supabase-errors.mjs and
 * the iOS unused-members check both had to be rewritten to avoid.
 *
 *   node scripts/check-edge-types.mjs            # check
 *   node scripts/check-edge-types.mjs --write    # re-baseline
 *   node scripts/check-edge-types.mjs --list     # print every error
 *
 * Requires node_modules (it shells out to the local tsc).
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, '.github/edge-type-baseline.json');
const BASE_CONFIG = join(ROOT, 'tsconfig.edge.json');
const WRITE = process.argv.includes('--write');
const LIST = process.argv.includes('--list');

if (!existsSync(BASE_CONFIG)) {
  console.error('[edge-types] tsconfig.edge.json not found - refusing to pass.');
  process.exit(1);
}

/** The wide config: same shims, every function directory, narrowing enabled. */
const base = JSON.parse(readFileSync(BASE_CONFIG, 'utf8'));
const wide = {
  ...base,
  compilerOptions: { ...base.compilerOptions, strictNullChecks: true },
  include: ['supabase/functions/_typecheck/*.d.ts', 'supabase/functions/**/*.ts'],
};

const dir = mkdtempSync(join(tmpdir(), 'edge-types-'));
const configPath = join(dir, 'tsconfig.json');
// `include` AND `paths` are both resolved relative to the config's own
// location, so both have to be absolute once the config lives in a temp dir.
// The first version left `paths` relative: every https import stopped
// resolving and the count came back 423 instead of 166, which looked like a
// far worse codebase rather than a broken harness.
writeFileSync(
  configPath,
  JSON.stringify(
    {
      ...wide,
      compilerOptions: {
        ...wide.compilerOptions,
        paths: Object.fromEntries(
          Object.entries(wide.compilerOptions.paths ?? {}).map(([k, v]) => [k, v.map((p) => join(ROOT, p))]),
        ),
      },
      include: wide.include.map((p) => join(ROOT, p)),
    },
    null,
    2,
  ),
);

let out = '';
try {
  execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', configPath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const counts = new Map();
const lines = [];
for (const line of out.split('\n')) {
  const m = line.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (!m) continue;
  const abs = m[1].replace(/\\/g, '/');
  const idx = abs.indexOf('supabase/functions/');
  if (idx === -1) continue; // an error in the shim itself, or outside the tree
  const rel = abs.slice(idx);
  counts.set(rel, (counts.get(rel) ?? 0) + 1);
  lines.push(`${rel}:${m[2]} ${m[4]}: ${m[5]}`);
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`[edge-types] ${total} error(s) across ${counts.size} file(s) in supabase/functions.`);

if (LIST) for (const l of lines) console.log(`  ${l}`);

if (WRITE) {
  const files = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        $comment:
          'WEB-BE-032. Per-FILE type-error counts for supabase/functions under tsconfig.edge.json + strictNullChecks. Lower is better. Many entries are shim artifacts, not defects - see the header of scripts/check-edge-types.mjs. Re-baseline with: node scripts/check-edge-types.mjs --write',
        generated: new Date().toISOString().slice(0, 10),
        total,
        files,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[edge-types] baseline written: ${total} error(s) in ${counts.size} file(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[edge-types] no baseline. Create one with --write.');
  process.exit(1);
}

const prev = JSON.parse(readFileSync(BASELINE, 'utf8')).files ?? {};
const regressions = [];
const improvements = [];
for (const file of new Set([...Object.keys(prev), ...counts.keys()])) {
  const before = prev[file] ?? 0;
  const after = counts.get(file) ?? 0;
  if (after > before) regressions.push({ file, before, after });
  else if (after < before) improvements.push({ file, before, after });
}

if (improvements.length) {
  console.log(
    `\n${improvements.reduce((n, i) => n + (i.before - i.after), 0)} error(s) across ${improvements.length} file(s) fixed. Re-baseline to lock it in.`,
  );
}

if (regressions.length === 0) {
  console.log('\nOK No file gained a type error.');
  process.exit(0);
}

console.error(`\nX ${regressions.length} file(s) gained a type error:\n`);
for (const { file, before, after } of regressions) {
  console.error(`  ${file}: ${before} -> ${after}`);
  for (const l of lines.filter((x) => x.startsWith(`${file}:`))) console.error(`      ${l.slice(file.length + 1)}`);
}
console.error(
  '\n  Nothing else type-checks supabase/functions: tsconfig.json excludes it,\n' +
    '  no workflow runs deno check, and eslint runs no type-aware rules there.\n' +
    '  A wrong name in an import throws at MODULE LOAD in Deno - assign-role was\n' +
    '  a deployed function that could not start. See WEB-QA-001.',
);
process.exit(1);
