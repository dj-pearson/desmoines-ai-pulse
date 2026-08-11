#!/usr/bin/env node
/**
 * Ratchet for discarded Supabase errors (WEB-BE-032).
 *
 * WHY THIS SHAPE, AND NOT AN ESLINT RULE
 * The story asks for an ESLint rule flagging `const { data } = await supabase`
 * with no `error` in the destructure. Measured first: that pattern occurs 181
 * times across 95 files in src/. `npm run lint` already emits 5,085 warnings,
 * so 181 more would be invisible — a guard that exists, runs, and cannot fail,
 * which is the exact defect class this codebase keeps rediscovering. A ratchet
 * fails on the NEXT one instead, which is the behaviour actually wanted.
 *
 * WHY IT MATTERS. supabase-js RESOLVES with an { error } object rather than
 * throwing, so a try/catch around a call is dead code and a destructure that
 * omits `error` discards the failure silently. Four separate writers were found
 * doing this in one session, each having recorded ZERO rows since the day it
 * shipped: ad fill rate and the home A/B cohort (WEB-QA-026), the subscription
 * conversion funnel (same), and page views (WEB-QA-013). None produced any
 * signal — the failures were either destructured away, swallowed by an
 * unreachable catch, or logged through console.* that esbuild.drop strips from
 * production builds.
 *
 * The check is deliberately narrow: an awaited call whose result is destructured
 * with `data` but not `error`. It does not judge whether ignoring the error is
 * acceptable — plenty of best-effort analytics writes legitimately ignore it.
 * It only insists that the count per file never grows without someone deciding
 * to re-baseline.
 *
 * Usage:
 *   node scripts/check-error-handling.mjs            # check against baseline
 *   node scripts/check-error-handling.mjs --update   # re-baseline (must shrink)
 */
import { ESLint } from 'eslint';
import tsparser from '@typescript-eslint/parser';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'error-handling-baseline.json');
const UPDATE = process.argv.includes('--update');

/**
 * An awaited call destructured with `data` and no `error`. Written as an AST
 * selector rather than a regex so multi-line destructures and renamed bindings
 * (`data: rows`) are handled by the parser instead of by guesswork.
 */
const SELECTOR =
  'VariableDeclarator[init.type="AwaitExpression"] > ObjectPattern:has(Property[key.name="data"]):not(:has(Property[key.name="error"]))';

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parser: tsparser,
        parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      },
      rules: {
        'no-restricted-syntax': ['warn', { selector: SELECTOR, message: 'discarded supabase error' }],
      },
    },
  ],
});

/**
 * Edge functions are included deliberately, and they are the more important
 * half. WEB-BE-032 AC1: "triage the 335 edge-function sites first — server-side
 * has no UI and no browser console, so a swallowed error there produces no
 * signal at all". In src/ a discarded error at least leaves a broken screen
 * somebody can see; in a Deno function it leaves nothing anywhere.
 *
 * supabase/functions/_tests/ is excluded: a test that discards an error fails
 * the test, which is its own signal.
 */
const results = await eslint.lintFiles([
  'src/**/*.ts',
  'src/**/*.tsx',
  'supabase/functions/**/*.ts',
]);

const current = {};
let total = 0;
for (const r of results) {
  if (!r.messages.length) continue;
  const rel = relative(ROOT, r.filePath).replace(/\\/g, '/');
  current[rel] = r.messages.length;
  total += r.messages.length;
}

/**
 * What the baseline covers. Recorded in the file so a WIDER scan is
 * distinguishable from a regression — without it, adding edge functions looks
 * identical to someone discarding 339 more errors, and the only way past the
 * shrink-only guard would be to disable it.
 */
const SCOPE = 'src + supabase/functions';

if (UPDATE) {
  const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const rescoped = prev && prev.scope !== SCOPE;

  if (prev && total > prev.total && !rescoped) {
    console.error(
      `\n[error-handling] refusing to re-baseline upward: ${total} vs ${prev.total}.\n` +
        'The baseline may only shrink. Fix the new sites instead.\n'
    );
    process.exit(1);
  }
  if (rescoped) {
    console.warn(
      `\n[error-handling] SCOPE CHANGED: "${prev.scope ?? '(unrecorded)'}" -> "${SCOPE}".\n` +
        `Allowing a higher total (${prev.total} -> ${total}) because the scan now covers\n` +
        'more code, not because more errors are being discarded. This is the only\n' +
        'condition under which the baseline may grow.\n'
    );
  }
  writeFileSync(BASELINE, `${JSON.stringify({ scope: SCOPE, total, files: current }, null, 2)}\n`);
  console.log(`[error-handling] baseline written: ${total} site(s) across ${Object.keys(current).length} file(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[error-handling] no baseline. Create one with --update.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseFiles = baseline.files || {};

const regressions = [];
for (const [file, count] of Object.entries(current)) {
  const before = baseFiles[file] ?? 0;
  if (count > before) regressions.push({ file, before, after: count });
}
const improvements = [];
for (const [file, before] of Object.entries(baseFiles)) {
  const after = current[file] ?? 0;
  if (after < before) improvements.push({ file, before, after });
}

console.log(
  `[error-handling] ${total} discarded-error site(s) across ${Object.keys(current).length} file(s); baseline ${baseline.total}.`
);

if (improvements.length) {
  console.log('\nImproved:');
  for (const i of improvements) console.log(`  ${i.file}: ${i.before} -> ${i.after}`);
}

if (regressions.length) {
  console.error('\n❌ error-handling: these files discard MORE Supabase errors than the baseline allows:');
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.before === 0 ? 'NEW' : `${r.before} -> ${r.after}`}`);
  }
  console.error(
    '\nsupabase-js resolves with an { error } object rather than throwing, so an\n' +
      'omitted `error` discards the failure silently — no exception, no console\n' +
      'output in production (esbuild.drop strips console.*), no signal at all.\n' +
      'Destructure `error` and act on it, or if the write is genuinely best-effort,\n' +
      'log it and say so in a comment.\n' +
      'If this is a deliberate trade, re-baseline with:\n' +
      '  node scripts/check-error-handling.mjs --update\n'
  );
  process.exit(1);
}

console.log('\n✅ No new discarded Supabase errors.');
