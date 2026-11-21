#!/usr/bin/env node
/**
 * Every Deno test under supabase/functions is run by some workflow.
 *
 * subscription-sync-tests.yml names each suite on its own `deno test <file>`
 * line, with the permissions that suite needs. That is deliberate (the flags
 * differ) and it has the drift check-e2e-lanes.mjs exists for on the
 * Playwright side: a new *.test.ts is written, passes locally, and no lane
 * ever runs it. Eleven were in that state on 2026-09-30, one of which
 * (fetchWithTimeout) hung forever after passing and would have been found the
 * first time CI ran it.
 *
 * A gate, not a ratchet: all of them run today, so any unrun suite is new.
 * Comments are stripped first, so a suite named only in a comment is unrun.
 *
 * SECOND GATE (WEB-CI-036): no suite imports straight from deno.land or esm.sh.
 * Cloud agent containers get a 403 from both, and 90 suites took their asserts
 * from https://deno.land/std, so 94 of 166 lane steps failed at import there
 * and every "not run here (no Deno)" note stayed unverified. One of the 94 was
 * a real failure hidden among them (nlp-search's drift guard, red since
 * WEB-SEO-063). Use jsr:@std/assert@1 or node:assert; neither needs those
 * hosts. Imports a suite reaches through the module under test are not checked
 * here, because changing those changes production edge code.
 *
 *   node scripts/check-deno-lanes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.test.ts')) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

const suites = walk(FUNCTIONS).sort();
if (suites.length === 0) {
  console.error('[deno-lanes] found no *.test.ts under supabase/functions - refusing to pass.');
  process.exit(1);
}

const laneText = readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => readFileSync(join(WORKFLOWS, f), 'utf8').replace(/(^|\s)#.*$/gm, '$1'))
  .join('\n');

const run = new Set(
  [...laneText.matchAll(/deno test[^\n]*?\s(supabase\/functions\/\S+\.test\.ts)/g)].map((m) => m[1]),
);
const unrun = suites.filter((s) => !run.has(s));

const REMOTE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](https:\/\/(?:deno\.land|esm\.sh)\/[^"']+)["']/g;
const remote = [];
for (const s of suites) {
  const text = readFileSync(join(ROOT, s), 'utf8');
  for (const m of text.matchAll(REMOTE_IMPORT)) remote.push(`${s}: ${m[1]}`);
}
if (remote.length > 0) {
  console.error('\nX Deno suites importing straight from deno.land or esm.sh:');
  for (const r of remote) console.error(`  ${r}`);
  console.error(
    '\nCloud agent containers cannot reach those hosts, so the suite cannot run\n' +
      'there. Import asserts from jsr:@std/assert@1 (or node:assert) instead.',
  );
}

console.log(`[deno-lanes] ${suites.length} Deno suite(s); ${run.size} named on a deno test line.`);
if (unrun.length === 0) {
  if (remote.length > 0) process.exit(1);
  console.log('OK Every Deno suite under supabase/functions runs in CI and imports nothing from deno.land or esm.sh.');
  process.exit(0);
}
console.error('\nX Deno suites no workflow runs:');
for (const s of unrun) console.error(`  ${s}`);
console.error(
  '\nAdd a `deno test <flags> <file>` line to subscription-sync-tests.yml with the\n' +
    'permissions the suite needs. A suite that passes locally and runs nowhere is\n' +
    'coverage nobody has.',
);
process.exit(1);
