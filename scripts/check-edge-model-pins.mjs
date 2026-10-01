#!/usr/bin/env node
/**
 * No edge function may hardcode a Claude model id (WEB-BE-041).
 *
 * WHAT THIS EXISTS FOR. restaurant-opening-scraper hardcoded
 * `model: 'claude-3-5-sonnet-20241022'` against api.anthropic.com, bypassing
 * _shared/aiConfig.ts. That model is retired, so the API answered not_found for
 * every source on every run. The handler pushed the error onto an array and
 * returned `success: true` with HTTP 200 anyway, and pg_cron's job_run_details
 * records the POST as succeeded either way (WEB-OPS-007) - so a job that had
 * not worked in months looked identical to one that had.
 *
 * A HARDCODED ID IS THE DEFECT, not the specific id. Model ids retire; a
 * constant in one of 120 function directories retires with nobody watching,
 * and the failure surfaces as a 404 inside a try/catch. getAIConfig reads the
 * ai_config row, so one update moves every caller.
 *
 * THE STORY NAMED ONE FUNCTION AND THERE WERE SEVEN CALL SITES. That is the
 * reason this is a checked-in list rather than a fix: converting each one is
 * its own change (different max_tokens, temperature, and lightweight-vs-default
 * model semantics), and until they are converted the list at least stops an
 * eighth appearing. It must only ever SHRINK.
 *
 * KNOWN-RETIRED ids are printed separately on every run. They are in the
 * baseline rather than failing the build because four of them predate this
 * check and gating on them would be red from the first run - the WEB-CI-020 /
 * WEB-CI-021 trap. A NEW one fails like any other new pin.
 *
 * Exit 0 when nothing was added, 1 otherwise. `--write` re-baselines.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const BASELINE = join(ROOT, '.github', 'edge-model-baseline.json');
const WRITE = process.argv.includes('--write') || process.argv.includes('--update');

/** Any quoted string that looks like a Claude model id. */
const MODEL_RE = /['"](claude-[a-z0-9][a-z0-9.\-]*)['"]/g;

/**
 * Ids the Anthropic API no longer serves. A call naming one of these 404s, and
 * the 404 lands inside whatever try/catch the function happens to have.
 */
const RETIRED = /^claude-(?:instant|1|2|3-(?:opus|sonnet|haiku)|3-5-|3-7-)/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === '_tests' || entry === '_typecheck') continue;
      out.push(...walk(p));
    } else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Comments describe the defect; they must not count as committing it. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
}

if (!existsSync(FUNCTIONS)) {
  console.log('check-edge-model-pins: no supabase/functions directory, nothing to check.');
  process.exit(0);
}

const found = [];
/** Retired ids in aiConfig itself - a stale default breaks every caller. */
const configRetired = [];
for (const file of walk(FUNCTIONS)) {
  // _shared/aiConfig.ts is the ONE place a model id belongs - it holds the
  // fallback defaults getAIConfig uses when the ai_config row is unreadable.
  // Listing it would make the fix look like the defect. Its own ids are still
  // checked against RETIRED below, because a stale default there breaks every
  // caller at once rather than one function.
  const isConfig = file.endsWith('_shared/aiConfig.ts');
  const src = stripComments(readFileSync(file, 'utf8'));
  // Only count an id that is being USED as a model - assigned to a `model`
  // key, or to a constant whose name says so. A model id inside a docstring
  // table or a list of allowed values is not a call.
  const uses = new Set();
  MODEL_RE.lastIndex = 0;
  let m;
  while ((m = MODEL_RE.exec(src)) !== null) {
    const before = src.slice(Math.max(0, m.index - 60), m.index);
    // Any identifier ENDING in model/Model/MODEL: `model:`, `claudeModel:`,
    // `const MODEL =`, `default_model:`. The first draft required a word
    // boundary before "model", so it missed bulk-enhance-events' `claudeModel:`
    // - which turned out to be reporting a model the function does not call.
    if (/[A-Za-z_]*(?:model|Model|MODEL)\s*[:=]\s*$/.test(before)) uses.add(m[1]);
  }
  for (const id of uses) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (isConfig) {
      if (RETIRED.test(id)) configRetired.push({ file: rel, model: id });
      continue;
    }
    found.push({ file: rel, model: id });
  }
}
found.sort((a, b) => (a.file + a.model).localeCompare(b.file + b.model));

const key = (e) => `${e.file}::${e.model}`;

if (WRITE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'Edge functions that hardcode a Claude model id instead of reading it from ' +
          '_shared/aiConfig.ts (WEB-BE-041). This list must only ever SHRINK. See ' +
          'scripts/check-edge-model-pins.mjs.',
        generated: new Date().toISOString().slice(0, 10),
        pins: found,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[edge-models] baseline written: ${found.length} hardcoded pin(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`[edge-models] no baseline at ${relative(ROOT, BASELINE)}. Write one with --write.`);
  process.exit(1);
}

const base = new Set((JSON.parse(readFileSync(BASELINE, 'utf8')).pins || []).map(key));
const added = found.filter((e) => !base.has(key(e)));
const removed = [...base].filter((k) => !found.some((e) => key(e) === k));

if (added.length > 0) {
  console.error(`\n[edge-models] ${added.length} new hardcoded model id(s):`);
  for (const e of added) {
    const tag = RETIRED.test(e.model) ? '  <- RETIRED, this id 404s' : '';
    console.error(`  ${e.file}: ${e.model}${tag}`);
  }
  console.error(
    '\nModel ids retire. Build the request with buildClaudeRequest() from\n' +
      '_shared/aiConfig.ts so the id lives in one place and one ai_config update\n' +
      'moves every caller. See supabase/functions/restaurant-opening-scraper/.'
  );
  process.exit(1);
}

if (configRetired.length > 0) {
  console.error('\n[edge-models] _shared/aiConfig.ts defaults to a RETIRED model:');
  for (const e of configRetired) console.error(`  ${e.model}`);
  console.error(
    '\nThis is the fallback every caller gets when the ai_config row is unreadable,\n' +
      'so a retired id here breaks all of them at once. No baseline covers this.'
  );
  process.exit(1);
}

const retired = found.filter((e) => RETIRED.test(e.model));
console.log(`[edge-models] ${found.length} hardcoded pin(s) in the baseline; none added.`);
if (retired.length > 0) {
  console.log(
    `\n${retired.length} of them name a RETIRED model. These calls 404 today (WEB-BE-041):`
  );
  for (const e of retired) console.log(`  ${e.file}: ${e.model}`);
}
if (removed.length > 0) {
  console.log(`\nDown ${removed.length} from the baseline. Re-baseline with --write:`);
  for (const k of removed) console.log(`  ${k}`);
}
