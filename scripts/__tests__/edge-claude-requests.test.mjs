#!/usr/bin/env node
/**
 * The three Claude callers that were pinned to a retired model (WEB-BE-041).
 *
 *   npx tsx scripts/__tests__/edge-claude-requests.test.mjs
 *
 * analyze-competitor (twice), moderate-content and triage-event-submission all
 * hardcoded claude-3-haiku-20240307. That model is retired, so every one of
 * those calls 404s - and each function swallows the failure in a different
 * way: the triage safety check fails closed and returns "undetermined" for
 * every submission, moderation returns the error verdict, and the competitor
 * analysis throws. Four calls, none of them working, all reported as a
 * degraded-but-fine path.
 *
 * check-edge-models stops a retired id coming BACK. What it cannot see is the
 * shape of what replaced it, and one of those shapes is load-bearing:
 * buildLightweightClaudeRequest returns only model/max_tokens/temperature/
 * messages, so triage's `system` prompt has to be spread back on. Drop that
 * spread and the safety check still runs, still returns 200, and is simply no
 * longer told what to check for.
 */
import { readFileSync } from 'node:fs';

const CALLERS = [
  'supabase/functions/analyze-competitor/index.ts',
  'supabase/functions/moderate-content/index.ts',
  'supabase/functions/triage-event-submission/index.ts',
];

/** Comments first: each of these files explains the retired id it replaced. */
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');

let bad = 0;
const ck = (name, ok, actual) => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    bad++;
    console.log(`  FAIL  ${name}${actual === undefined ? '' : `  -> ${actual}`}`);
  }
};

console.log('the model id comes from config, not from the file');
for (const file of CALLERS) {
  const code = codeOnly(readFileSync(file, 'utf8'));
  ck(`${file} builds its request through the shared helper`, code.includes('buildLightweightClaudeRequest'));
  ck(`${file} names no model id of its own`, !/model:\s*['"]claude-/.test(code), (code.match(/model:\s*['"]claude-[^'"]*/) || [])[0]);
}

console.log('\nanalyze-competitor has TWO calls and both were pinned');
{
  const code = codeOnly(readFileSync(CALLERS[0], 'utf8'));
  const n = (code.match(/buildLightweightClaudeRequest\(/g) || []).length;
  // The first pass through this file converted one of them and the checker
  // still reported the file, which is how the second was found.
  ck('both calls are converted', n === 2, String(n));
}

console.log('\ntriage keeps its system prompt');
{
  const code = codeOnly(readFileSync(CALLERS[2], 'utf8'));
  // The helper does not carry `system`, so it is spread back on. Without it
  // the safety check runs with no instructions and answers 200.
  ck('the request body spreads system back on', /\.\.\.base,\s*system/.test(code));
  ck('buildSafetyRequest still supplies it', code.includes('const { system, userContent }'));
}

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
