#!/usr/bin/env node
/**
 * Stale-entry detection in check-schema-usage.mjs (WEB-QA-047).
 *
 *   npx tsx scripts/__tests__/schema-baseline-stale.test.mjs
 *
 * The baseline fingerprint is kind|file|name. When a file is deleted or a hook
 * stops calling an RPC, the entry outlives the reference and pre-approves its
 * return. On 2026-11-08 the baseline held 21 of these (58 entries, 37 live),
 * including table|src/hooks/useSessionTimeout.ts|user_sessions: adding that
 * query back to the hook passed the ratchet. The checker now fails on them.
 *
 * The last case reads the committed baseline and the real scan, so a deletion
 * that forgets `npm run check-schema:update` fails here as well as in validate.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleBaselineEntries } from '../check-schema-usage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};
const finding = (kind, file, name) => ({ kind, file, name, line: 1 });

check('staleBaselineEntries is exported', typeof staleBaselineEntries === 'function');

check(
  'an entry the scan still produces is not stale',
  staleBaselineEntries(new Set(['rpc|src/a.ts|f']), [finding('rpc', 'src/a.ts', 'f')]).length === 0
);

{
  const got = staleBaselineEntries(new Set(['table|src/gone.ts|user_sessions']), []);
  check('an entry for a deleted file is stale', got.length === 1 && got[0] === 'table|src/gone.ts|user_sessions', JSON.stringify(got));
}

{
  // The useSessionTimeout shape: the file is still there and still has other
  // findings, but one call was removed. File existence alone would miss it.
  const got = staleBaselineEntries(
    new Set(['rpc|src/hooks/x.ts|get_policy', 'rpc|src/hooks/x.ts|revoke_session']),
    [finding('rpc', 'src/hooks/x.ts', 'get_policy')]
  );
  check('a removed call in a surviving file is stale', got.length === 1 && got[0] === 'rpc|src/hooks/x.ts|revoke_session', JSON.stringify(got));
}

check(
  'the line number is not part of the identity',
  staleBaselineEntries(new Set(['column|src/a.ts|events.x']), [{ ...finding('column', 'src/a.ts', 'events.x'), line: 900 }]).length === 0
);

check(
  'a moved reference (same name, other file) leaves the old entry stale',
  staleBaselineEntries(new Set(['table|src/old.ts|payments']), [finding('table', 'src/new.ts', 'payments')]).length === 1
);

check(
  'repeated findings for one fingerprint count once',
  staleBaselineEntries(new Set(['rpc|src/a.ts|f']), [finding('rpc', 'src/a.ts', 'f'), finding('rpc', 'src/a.ts', 'f')]).length === 0
);

{
  const got = staleBaselineEntries(new Set(['rpc|b|z', 'rpc|a|y']), []);
  check('output is sorted, so the message is stable', got[0] === 'rpc|a|y' && got[1] === 'rpc|b|z', JSON.stringify(got));
}

// --- the committed baseline against the real scan -------------------------
{
  const baseline = JSON.parse(readFileSync(join(ROOT, 'schema-baseline.json'), 'utf8')).findings;
  // --all exits 1 whenever any finding exists, which is the normal state, so
  // the exit code says nothing here; the JSON does.
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts/check-schema-usage.mjs'), '--all', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = run.stdout;
  const all = JSON.parse(out).findings;
  const stale = staleBaselineEntries(new Set(baseline), all);
  check('schema-baseline.json holds no stale entries', stale.length === 0, stale.join(', '));
}

if (failures > 0) {
  console.error(`[schema-baseline-stale] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[schema-baseline-stale] all checks passed');
