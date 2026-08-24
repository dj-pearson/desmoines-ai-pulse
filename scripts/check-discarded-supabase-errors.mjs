#!/usr/bin/env node
/**
 * Ratchet on Supabase calls that destructure `data` and drop `error`
 * (WEB-BE-032 AC4).
 *
 * THE DEFECT. `const { data } = await supabase.from('x')...` cannot tell a
 * missing table from an empty table: PostgREST returns `{ data: null, error }`
 * for 42P01 and `{ data: [], error: null }` for a table with no rows, and a call
 * site that reads only `data` renders both as an empty state. That is why
 * WEB-QA-018's 29 missing tables and WEB-QA-019's 25 missing RPCs went unnoticed
 * for months - every one of them looked like a quiet Tuesday.
 *
 * WHY A RATCHET AND NOT A LINT ERROR. There are hundreds of existing sites and
 * WEB-BE-032 says explicitly that they are a cleanup pattern rather than a bug
 * list - plenty are genuinely best-effort. Turning them all into errors breaks
 * the build; turning them into warnings adds them to a `npm run lint` that
 * already emits thousands and would be read by nobody. A baseline fails only on
 * NEW ones, which is what the AC actually asks for.
 *
 * THE BASELINE IS PER FILE, NOT PER LINE, and that is a correction. It used to
 * hold `path:line` strings, so any edit above a recorded site re-keyed it and
 * the checker reported one fix and one new violation for a change that touched
 * neither. That is not theoretical: on origin/main it produced 124 "fixed" and
 * 25 "new", all 25 a few lines from a baselined entry in the same file, and the
 * check had been red for a while with nobody watching - it ran only in
 * rls-config-audit.yml, on a nightly cron. It now runs in pr-checks.yml too.
 *
 * WHY NOT AN ESLint RULE, which the AC suggests first: eslint only covers src/,
 * and AC1 says the 335 EDGE-FUNCTION sites matter most, because server-side
 * there is no UI and no browser console - a swallowed error there produces no
 * signal at all. A script covers both trees.
 *
 * Usage:
 *   node scripts/check-discarded-supabase-errors.mjs           # compare to baseline
 *   node scripts/check-discarded-supabase-errors.mjs --write   # re-baseline
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'supabase-error-baseline.json');
const ROOTS = ['src', 'supabase/functions'];
const EXT = /\.(ts|tsx)$/;

/** Marks the awaited expression as a Supabase call rather than any other await. */
const SUPABASE_CALL = /\.(from|rpc|invoke|functions|storage|auth)\b/;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (EXT.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Find `const { ... } = await <supabase call>` where the destructure has no
 * `error`.
 *
 * The awaited expression is taken up to the statement's terminating semicolon,
 * because these calls are routinely written across five or six chained lines and
 * a line-based scan would see only `= await supabase`.
 */
function discardedErrors(source) {
  const hits = [];
  const re = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s/g;

  for (let m = re.exec(source); m; m = re.exec(source)) {
    const bound = m[1];
    // `error` in any form - renamed (`error: err`), or plain.
    if (/\berror\b/.test(bound)) continue;
    // Only care when `data` is actually taken; `{ count }` alone is a different
    // shape and usually deliberate.
    if (!/\bdata\b/.test(bound)) continue;

    const end = source.indexOf(';', m.index);
    const statement = source.slice(m.index, end === -1 ? source.length : end);
    if (!SUPABASE_CALL.test(statement)) continue;

    hits.push(source.slice(0, m.index).split('\n').length);
  }
  return hits;
}

const files = ROOTS.flatMap((r) => (existsSync(join(ROOT, r)) ? sourceFiles(join(ROOT, r)) : []));
if (files.length === 0) {
  console.error('[supabase-errors] no source files found - refusing to pass.');
  process.exit(1);
}

const found = [];
for (const file of files) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  for (const line of discardedErrors(readFileSync(file, 'utf8'))) {
    found.push(`${rel}:${line}`);
  }
}
// Sorted by file then LINE NUMBER, not lexically - otherwise :114 sorts above
// :87 and a diff of this baseline is unreadable.
found.sort((a, b) => {
  const [fa, la] = a.split(':');
  const [fb, lb] = b.split(':');
  return fa === fb ? Number(la) - Number(lb) : fa < fb ? -1 : 1;
});

const inFunctions = found.filter((f) => f.startsWith('supabase/functions/')).length;
console.log(
  `[supabase-errors] ${files.length} file(s), ${found.length} site(s) discard the error ` +
    `(${inFunctions} in edge functions, where nothing surfaces it).`
);

if (process.argv.includes('--write')) {
  const counts = {};
  for (const site of found) {
    const file = site.slice(0, site.lastIndexOf(':'));
    counts[file] = (counts[file] ?? 0) + 1;
  }
  writeFileSync(BASELINE, `${JSON.stringify({ files: counts }, null, 2)}\n`);
  console.log(
    `Wrote ${Object.keys(counts).length} file(s), ${found.length} site(s) to supabase-error-baseline.json.`
  );
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[supabase-errors] no baseline. Run with --write once, deliberately.');
  process.exit(1);
}

// KEYED BY FILE, NOT BY FILE:LINE, and that is a correction rather than a
// preference. The baseline used to hold 337 `path:line` strings, so ANY edit
// above a recorded site re-keyed it: the site at :175 became :178 and the
// checker reported one fix and one new violation for a change that touched
// neither. On origin/main today that produced 124 "fixed" and 25 "new", every
// one of the 25 sitting a few lines from a baselined entry in the same file.
// The check was therefore red, and had been for a while, and nobody saw it -
// it only ran in rls-config-audit.yml, on a nightly cron.
//
// check-bundle-budget.mjs's header already makes this argument for chunk names:
// "rollup renames and re-splits shared chunks between builds, so a per-chunk
// baseline churns constantly and reports regressions that are only chunk-
// boundary movement". Line numbers churn the same way and for the same reason.
//
// THE COST, stated because it is real: a per-file count cannot tell that one
// site was fixed and another added in the same file on the same commit. That
// trade buys a check that is green when nothing got worse, which is the only
// kind anyone reads. The current line numbers are printed for any file that
// regresses, so a reviewer still gets the location.
const byFile = new Map();
for (const site of found) {
  const [file, line] = [site.slice(0, site.lastIndexOf(':')), site.slice(site.lastIndexOf(':') + 1)];
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(Number(line));
}

const rawBaseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
// Accept the old `sites: ["path:line"]` shape so an un-migrated checkout still
// runs; collapse it to per-file counts on read.
const baseFiles = rawBaseline.files ?? (rawBaseline.sites ?? []).reduce((acc, s) => {
  const f = s.slice(0, s.lastIndexOf(':'));
  acc[f] = (acc[f] ?? 0) + 1;
  return acc;
}, {});

const regressions = [];
for (const [file, lines] of byFile) {
  const before = baseFiles[file] ?? 0;
  if (lines.length > before) regressions.push({ file, before, after: lines.length, lines });
}
const improvements = [];
for (const [file, before] of Object.entries(baseFiles)) {
  const after = byFile.get(file)?.length ?? 0;
  if (after < before) improvements.push({ file, before, after });
}

if (improvements.length > 0) {
  const total = improvements.reduce((n, i) => n + (i.before - i.after), 0);
  console.log(`\n${total} site(s) across ${improvements.length} file(s) no longer discard the error. Re-baseline to lock it in.`);
}

if (regressions.length > 0) {
  console.error(`\nX ${regressions.length} file(s) gained a Supabase call that discards the error:`);
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.before} -> ${r.after}  (lines ${r.lines.join(', ')})`);
  }
  console.error(
    '\n  `{ data }` without `error` cannot tell a missing table from an empty one -\n' +
      '  PostgREST returns data:null+error for 42P01 and data:[]+null for no rows,\n' +
      '  and both render as an empty state. Capture the error, or say in a comment\n' +
      '  that this call is best-effort so the next reader can tell. See WEB-BE-032.\n'
  );
  process.exit(1);
}

console.log('\nOK No file gained a Supabase call that discards the error.');
