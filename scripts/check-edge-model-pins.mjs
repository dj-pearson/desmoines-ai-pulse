#!/usr/bin/env node
/**
 * No Claude model id literal under supabase/functions except in the resolver
 * (WEB-BE-041, then DEFAULT_AI_MODEL on 2026-10-12).
 *
 * WHAT THIS EXISTS FOR. restaurant-opening-scraper hardcoded
 * `model: 'claude-3-5-sonnet-20241022'` against api.anthropic.com. That model
 * is retired, so the API answered not_found for every source on every run,
 * and the handler returned `success: true` with HTTP 200 anyway. Model ids
 * retire; a constant in one of 120 function directories retires with nobody
 * watching, and the failure surfaces as a 404 inside a try/catch.
 *
 * THE RULE. The model comes from the DEFAULT_AI_MODEL / LIGHTWEIGHT_AI_MODEL
 * secrets through supabase/functions/_shared/aiModel.ts, which also holds the
 * one fallback id. Any other Claude model id in production code under
 * supabase/functions fails this check - not only ones assigned to a `model`
 * key, because an id in a constant, a default parameter or a comparison is the
 * same defect one step removed.
 *
 * It used to be a ratchet over a baseline of known pins, plus a separate check
 * that aiConfig.ts's own defaults were not retired. Both are gone: the baseline
 * reached zero when every call site moved to the resolver, so this is a gate.
 *
 * ALLOWED:
 *   _shared/aiModel.ts        the resolver - the ONE place a model id is chosen.
 *   _shared/providerUsage.ts  the price table; it MAPS ids to prices and has to
 *                             name them to recognise them. It chooses nothing.
 *   *.test.ts, _tests/, _typecheck/, fixtures/  tests and fixtures.
 * Comments are stripped first: a comment naming the retired id it replaced is
 * the history of the defect, not the defect.
 *
 * Exit 0 when clean, 1 otherwise.
 *
 *   node scripts/check-edge-model-pins.mjs
 *   (counter-test: scripts/__tests__/edge-model-pins.test.mjs)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

/**
 * A quoted string that is a Claude model id: claude- followed by a model
 * family or a version number. "claude-code" or a header name is not one.
 */
const MODEL_RE =
  /['"`](claude-(?:opus|sonnet|haiku|fable|mythos|instant|\d)[a-z0-9.\-]*)['"`]/g;

/** Production files allowed to name a model id. Paths relative to supabase/functions. */
const ALLOWED_FILES = new Set(['_shared/aiModel.ts', '_shared/providerUsage.ts']);

/** Directories that hold tests or fixtures, skipped wherever they appear. */
const SKIP_DIRS = new Set(['_tests', '_typecheck', 'fixtures', 'node_modules']);

/** Retired ids, named in the output so a 404 is not mistaken for a style nit. */
const RETIRED = /^claude-(?:instant|1|2|3-|3-5-|3-7-|(?:sonnet|opus)-4-\d{8})/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...walk(p));
    } else if (/\.(?:ts|tsx|js|mjs)$/.test(entry) && !/\.test\.(?:ts|tsx|js|mjs)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/** Drop a trailing `// ...` from one line, ignoring a `//` inside a string. */
function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Comments describe the defect; they must not count as committing it. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(stripLineComment)
    .join('\n');
}

if (!existsSync(FUNCTIONS)) {
  console.log('check-edge-model-pins: no supabase/functions directory, nothing to check.');
  process.exit(0);
}

const found = [];
for (const file of walk(FUNCTIONS)) {
  const rel = relative(FUNCTIONS, file).replace(/\\/g, '/');
  if (ALLOWED_FILES.has(rel)) continue;
  const src = stripComments(readFileSync(file, 'utf8'));
  MODEL_RE.lastIndex = 0;
  let m;
  const ids = new Set();
  while ((m = MODEL_RE.exec(src)) !== null) ids.add(m[1]);
  for (const id of ids) found.push({ file: `supabase/functions/${rel}`, model: id });
}
found.sort((a, b) => (a.file + a.model).localeCompare(b.file + b.model));

if (found.length > 0) {
  console.error(`\n[edge-models] ${found.length} Claude model id literal(s) outside the resolver:`);
  for (const e of found) {
    const tag = RETIRED.test(e.model) ? '  <- RETIRED, this id 404s' : '';
    console.error(`  ${e.file}: ${e.model}${tag}`);
  }
  console.error(
    '\nThe model comes from DEFAULT_AI_MODEL / LIGHTWEIGHT_AI_MODEL. Call\n' +
      'defaultModel() or lightweightModel() from _shared/aiModel.ts (re-exported by\n' +
      '_shared/aiConfig.ts), or build the body with buildClaudeRequest() /\n' +
      'buildLightweightClaudeRequest(), and pass any hand-built body through\n' +
      'shapeClaudeRequest() so it is valid for whichever model the secret names.'
  );
  process.exit(1);
}

console.log(
  `[edge-models] no Claude model id outside ${[...ALLOWED_FILES].join(', ')} (tests and comments excluded).`
);
