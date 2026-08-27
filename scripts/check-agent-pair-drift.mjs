/**
 * Duplicated-agent drift check (WEB-BE-032).
 *
 * Every AOS agent exists TWICE: as a standalone `supabase/functions/agent-<x>/`
 * edge function, and as a `supabase/functions/_shared/agents/<key>.ts` module
 * that agent-runner dispatches. Migration 20260710000000 repointed all 34 cron
 * jobs to agent-runner, so the SHARED copy is the scheduled one -- but the
 * standalones are still deployed and still callable by an admin or an API key.
 *
 * WHY THIS EXISTS. Three fixes landed on one copy and not the other, and all
 * three were found by hand on 2026-08-27:
 *
 *   WEB-LEGAL-005  agent-support-responder had NO crisis handling at all. The
 *                  AC named the shared file, the fix went there, and
 *                  crisis-support.test.ts's SURFACES table listed the same
 *                  file -- so the second implementation was invisible from
 *                  every angle at once.
 *   WEB-LEGAL-006  the trial-conversion billing notice, shared only. The
 *                  standalone gated a required disclosure on marketing consent
 *                  and on an LLM score.
 *   compliance-monitor  count() returned `count ?? 0` with the error dropped,
 *                  so an unreadable table counted as zero and every gate below
 *                  read as "no violations".
 *
 * WHAT IT COMPARES, AND WHY NOT SIMILARITY. A percentage-overlap ratchet was
 * the obvious design and is the wrong one: the pairs sit at 78-98% for ordinary
 * reasons, so the tolerance needed to avoid firing on every edit is wider than
 * a three-line safety guard. This compares two EXACT SETS instead:
 *
 *   - the modules each copy imports
 *   - the top-level functions and SCREAMING_CASE constants each copy defines
 *
 * Both are how a real behavioural difference actually shows up. The crisis fix
 * was an import (crisisSupport.ts); the compliance fix was a function
 * (exceeds). Neither produces false positives on rewording or reordering, so
 * there is no baseline to drift and nothing to re-record after an ordinary
 * edit.
 *
 * PAIRS COME FROM THE MIGRATION, not from name matching. 22 of the 34 have
 * different names on each side (agent-backup-verify <-> backup-verifier.ts), so
 * matching by name finds 12 and silently ignores the rest.
 *
 *   node scripts/check-agent-pair-drift.mjs
 *   node scripts/check-agent-pair-drift.mjs --list   # print every pair
 *
 * If the answer to a finding is "these two should not both exist", that is the
 * open decision this check is a stand-in for: retire the standalones, or make
 * each a thin wrapper around its _shared module.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAPPING = join(
  ROOT,
  'supabase/migrations/20260710000000_repoint_agent_crons_to_runner.sql',
);
const LIST = process.argv.includes('--list');

/**
 * Differences that are structural rather than behavioural, because one side is
 * an HTTP entry point and the other is a dispatched module.
 *
 * Keep this list SHORT and justified. Every entry is a place the check has been
 * told not to look, which is how the `{ count }` exclusion in
 * check-discarded-supabase-errors.mjs came to hide the worst instance of the
 * defect it was written for.
 */
const WRAPPER_ONLY_IMPORTS = new Set([
  'cors', // the standalone terminates HTTP; the module does not
  'apiKeyAuth', // ditto: requireAdminOrApiKey is the edge function's gate
  'agentRun', // the standalone calls runAgent itself; agent-runner does it for the module
  'types', // AgentRun type import, module side only
]);

const WRAPPER_ONLY_NAMES = new Set([
  'json', // the standalone's Response helper
  'run', // the module's exported entry point
  'logErr', // local logging helper; the module inlines console.warn
]);

function parseMapping(sql) {
  return [...sql.matchAll(/\('(agent-[a-z0-9-]+)',\s*'([a-z0-9-]+)'\)/g)].map(
    ([, fn, key]) => ({ fn, key }),
  );
}

/** Strip comments so a reworded explanation is never a finding. */
function strip(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Module basenames, normalised across the two different relative depths. */
function imports(source) {
  const re = /from\s+['"](?:\.\.\/)+(?:_shared\/)?(?:agents\/)?([A-Za-z0-9_.-]+)\.ts['"]/g;
  const out = new Set();
  for (const m of strip(source).matchAll(re)) {
    if (!WRAPPER_ONLY_IMPORTS.has(m[1])) out.add(m[1]);
  }
  return out;
}

/** Top-level function declarations and SCREAMING_CASE constants. */
function declarations(source) {
  const out = new Set();
  const src = strip(source);
  for (const m of src.matchAll(/(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/g)) {
    if (!WRAPPER_ONLY_NAMES.has(m[1])) out.add(m[1]);
  }
  for (const m of src.matchAll(/(?:^|\n)(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*[:=]/g)) {
    if (!WRAPPER_ONLY_NAMES.has(m[1])) out.add(m[1]);
  }
  return out;
}

const sorted = (set) => [...set].sort();
const diff = (a, b) => sorted(new Set([...a].filter((x) => !b.has(x))));

if (!existsSync(MAPPING)) {
  console.error(`[agent-pair-drift] mapping migration not found at ${MAPPING} - refusing to pass.`);
  process.exit(1);
}

const pairs = parseMapping(readFileSync(MAPPING, 'utf8'));
if (pairs.length === 0) {
  console.error('[agent-pair-drift] no agent pairs parsed from the migration - refusing to pass.');
  process.exit(1);
}

const findings = [];
let compared = 0;
let unpaired = 0;

for (const { fn, key } of pairs) {
  const a = join(ROOT, 'supabase/functions', fn, 'index.ts');
  const b = join(ROOT, 'supabase/functions/_shared/agents', `${key}.ts`);
  // A missing side is not drift: the standalone may have been retired, which is
  // one of the two right answers here.
  if (!existsSync(a) || !existsSync(b)) {
    unpaired++;
    if (LIST) console.log(`  --  ${fn} <-> ${key} (only one side present)`);
    continue;
  }
  compared++;

  const [sa, sb] = [readFileSync(a, 'utf8'), readFileSync(b, 'utf8')];
  const ia = imports(sa);
  const ib = imports(sb);
  const da = declarations(sa);
  const db = declarations(sb);

  const gaps = [
    ['imports', diff(ib, ia), diff(ia, ib)],
    ['defines', diff(db, da), diff(da, db)],
  ].filter(([, onlyShared, onlyStandalone]) => onlyShared.length || onlyStandalone.length);

  if (gaps.length) findings.push({ fn, key, gaps });
  else if (LIST) console.log(`  ok  ${fn} <-> ${key}`);
}

console.log(
  `[agent-pair-drift] ${compared} agent pair(s) compared` +
    (unpaired ? `, ${unpaired} with only one side present` : ''),
);

if (findings.length === 0) {
  console.log('\nOK Every duplicated agent imports and defines the same things on both sides.');
  process.exit(0);
}

console.error(`\nX ${findings.length} agent pair(s) have drifted:\n`);
for (const { fn, key, gaps } of findings) {
  console.error(`  ${fn} <-> _shared/agents/${key}.ts`);
  for (const [kind, onlyShared, onlyStandalone] of gaps) {
    if (onlyShared.length) console.error(`    shared ${kind} but the standalone does not: ${onlyShared.join(', ')}`);
    if (onlyStandalone.length) console.error(`    standalone ${kind} but the shared module does not: ${onlyStandalone.join(', ')}`);
  }
}
console.error(
  '\n  Both copies are deployable. A guarantee added to one is not a guarantee.\n' +
    '  Port it to the other, or - if the difference is structural rather than\n' +
    '  behavioural - add it to WRAPPER_ONLY_IMPORTS / WRAPPER_ONLY_NAMES with a\n' +
    '  reason. Do not widen those sets to make this pass. See WEB-BE-032.',
);
process.exit(1);
