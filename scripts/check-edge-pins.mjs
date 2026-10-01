#!/usr/bin/env node
/**
 * supabase-js version pins across the edge functions (WEB-CI-030 AC6).
 *
 * THE DEFECT THIS EXISTS FOR. `_shared/securityLayers.ts` imported
 * `https://esm.sh/@supabase/supabase-js@2` while `create-campaign-checkout` -
 * the function that hands its client to `securityMiddleware` - imported
 * `@2.45.0`. esm.sh resolves a bare `@2` to whatever the latest 2.x is at the
 * moment it is fetched, and SupabaseClient's generic parameters differ in
 * ARITY between 2.x minors. So one dependency produced two incompatible
 * `SupabaseClient` types and the call failed with TS2345 - or did not - purely
 * according to what the module cache had resolved and when. A check that
 * passes on Monday and fails on Tuesday with no commit in between is worse
 * than a check that fails, because the first thing anyone does is re-run it.
 *
 * TWO RULES, and they do different jobs.
 *
 *   A (ratchet). A module in _shared/ must pin an exact version. It is
 *      consumed by functions that pin different versions, so it is the one
 *      place a floating specifier is guaranteed to meet a fixed one. 15 files
 *      still float; they are in the baseline and must only ever decrease.
 *      Converging them is a version bump on undeployed functions and belongs
 *      in its own change, not smuggled into a check.
 *
 *   B (gate, no exceptions). Where a _shared module is pinned AND exposes the
 *      `SupabaseClient` TYPE in its own signatures, every function that
 *      imports it directly and pins supabase-js must pin the SAME version.
 *      That is the actual invariant - rule A alone would be satisfied by
 *      pinning securityLayers to a version none of its callers use, which
 *      turns an intermittent mismatch into a permanent one.
 *
 * WHY RULE B CHECKS FOR THE TYPE AND NOT JUST THE IMPORT. The first draft
 * flagged 16 functions for disagreeing with `_shared/apiKeyAuth.ts`, which
 * pins 2.39.3 while its callers pin six versions between 2.7.1 and 2.53.0.
 * Every one of those is a false positive for THIS failure mode: apiKeyAuth
 * types its client parameters `any`, so no version-bearing type crosses the
 * boundary and no arity mismatch can be reported. They are still a real
 * inconsistency - two copies of one library in a function's module graph - and
 * they are printed as a warning rather than dropped, because a check that
 * fails on something it cannot justify is a check people turn off.
 *
 * Exit 0 when both hold, 1 otherwise. `--write` re-baselines rule A.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const SHARED = join(FUNCTIONS, '_shared');
const BASELINE = join(ROOT, '.github', 'edge-pin-baseline.json');
const WRITE = process.argv.includes('--write') || process.argv.includes('--update');

const PKG = '@supabase/supabase-js';
/** Matches esm.sh/@supabase/supabase-js@<spec>, capturing the spec. */
const IMPORT_RE = /esm\.sh\/@supabase\/supabase-js@([0-9][^'"\s?]*)/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** An exact pin is major.minor.patch. `2` and `2.45` both float. */
const isExact = (spec) => /^\d+\.\d+\.\d+$/.test(spec);

function specsIn(file) {
  const src = readFileSync(file, 'utf8');
  const found = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) found.add(m[1]);
  return { src, specs: [...found] };
}

if (!existsSync(FUNCTIONS)) {
  console.log('check-edge-pins: no supabase/functions directory, nothing to check.');
  process.exit(0);
}

const all = walk(FUNCTIONS);
const shared = all.filter((f) => f.startsWith(SHARED + '/'));

// ---------------------------------------------------------------- rule A
const floating = [];
/** relative path -> the exact version it pins, for rule B. */
const sharedPin = new Map();

for (const file of shared) {
  const { specs } = specsIn(file);
  if (specs.length === 0) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const loose = specs.filter((s) => !isExact(s));
  if (loose.length > 0) floating.push(rel);
  const exact = specs.filter(isExact);
  // A module pinning two different exact versions is its own bug; report the
  // set so the message names both rather than silently picking one.
  if (exact.length > 0 && loose.length === 0) sharedPin.set(rel, exact);
}

if (WRITE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          `Modules under supabase/functions/_shared/ that import ${PKG} without an exact ` +
          'version (WEB-CI-030 AC6). This list must only ever SHRINK. See scripts/check-edge-pins.mjs.',
        generated: new Date().toISOString().slice(0, 10),
        floating: floating.sort(),
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[edge-pins] baseline written: ${floating.length} floating _shared import(s).`);
  process.exit(0);
}

let failed = false;

if (!existsSync(BASELINE)) {
  console.error(`[edge-pins] no baseline at ${relative(ROOT, BASELINE)}. Write one with --write.`);
  process.exit(1);
}

const base = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).floating || []);
const added = floating.filter((f) => !base.has(f));
const fixed = [...base].filter((f) => !floating.includes(f));

if (added.length > 0) {
  failed = true;
  console.error(
    `\n[edge-pins] ${added.length} _shared module(s) import ${PKG} without an exact version:`
  );
  for (const f of added) console.error(`  ${f}`);
  console.error(
    `\nesm.sh resolves a floating major to the latest 2.x at fetch time, and SupabaseClient's\n` +
      `generics differ in arity between minors. Pin to the version this module's callers pin.`
  );
}

// ---------------------------------------------------------------- rule B
/**
 * True when the module names `SupabaseClient` in an import from supabase-js -
 * i.e. a version-bearing type, not just `createClient`, crosses its boundary.
 */
function exposesClientType(src) {
  return /import[^;]*\bSupabaseClient\b[^;]*esm\.sh\/@supabase\/supabase-js@/s.test(src);
}

const mismatches = [];
const warnings = [];
for (const [sharedRel, versions] of sharedPin) {
  const name = basename(sharedRel, '.ts');
  if (versions.length > 1) {
    mismatches.push(`${sharedRel} pins ${versions.join(' AND ')} in one file`);
    continue;
  }
  const want = versions[0];
  const typed = exposesClientType(readFileSync(join(ROOT, sharedRel), 'utf8'));
  for (const file of all) {
    if (file.startsWith(SHARED + '/')) continue;
    const { src, specs } = specsIn(file);
    // Direct import of the shared module, by any relative path that ends in it.
    if (!new RegExp(`['"][^'"]*_shared/${name}\\.ts['"]`).test(src)) continue;
    const exact = specs.filter(isExact);
    if (exact.length === 0) continue; // floating caller: rule A's problem, not B's
    for (const got of exact) {
      if (got === want) continue;
      const msg =
        `${relative(ROOT, file).replace(/\\/g, '/')} pins ${got} but imports ` +
        `${sharedRel}, which pins ${want}`;
      if (typed) mismatches.push(msg);
      else warnings.push(msg);
    }
  }
}

if (warnings.length > 0) {
  console.log(
    `\n[edge-pins] ${warnings.length} version disagreement(s) across an UNTYPED boundary ` +
      `(the shared module types its client \`any\`, so no arity mismatch can be reported). ` +
      `Not failing:`
  );
  for (const w of warnings) console.log(`  ${w}`);
}

if (mismatches.length > 0) {
  failed = true;
  console.error(`\n[edge-pins] ${mismatches.length} caller/shared version mismatch(es):`);
  for (const m of mismatches) console.error(`  ${m}`);
  console.error(
    `\nTwo specifiers for one dependency produce two SupabaseClient types. Passing a client\n` +
      `across that boundary is a TS2345 that appears and disappears with the module cache.`
  );
}

if (failed) process.exit(1);

console.log(
  `[edge-pins] ${sharedPin.size} pinned _shared module(s) agree with their callers; ` +
    `${floating.length} floating import(s) in the baseline.`
);
if (fixed.length > 0) {
  console.log(`Down ${fixed.length} from the baseline. Re-baseline with --write:`);
  for (const f of fixed) console.log(`  ${f}`);
}
