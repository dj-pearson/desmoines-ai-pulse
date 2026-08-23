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
  writeFileSync(BASELINE, `${JSON.stringify({ sites: found }, null, 2)}\n`);
  console.log(`Wrote ${found.length} entries to supabase-error-baseline.json.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[supabase-errors] no baseline. Run with --write once, deliberately.');
  process.exit(1);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).sites ?? []);
const fresh = found.filter((site) => !baseline.has(site));
const fixed = [...baseline].filter((site) => !found.includes(site));

if (fixed.length > 0) {
  console.log(`\n${fixed.length} site(s) no longer discard the error. Re-baseline to lock it in.`);
}

if (fresh.length > 0) {
  console.error(`\nX ${fresh.length} NEW site(s) discarding a Supabase error:`);
  for (const site of fresh) console.error(`  ${site}`);
  console.error(
    '\n  `{ data }` without `error` cannot tell a missing table from an empty one -\n' +
      '  PostgREST returns data:null+error for 42P01 and data:[]+null for no rows,\n' +
      '  and both render as an empty state. Capture the error, or say in a comment\n' +
      '  that this call is best-effort so the next reader can tell. See WEB-BE-032.\n'
  );
  process.exit(1);
}

console.log('\nOK No new sites discarding a Supabase error.');
