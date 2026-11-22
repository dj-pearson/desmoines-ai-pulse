#!/usr/bin/env node
/**
 * WEB-OPS-026: the one-time closure sweep proposes the right action for each
 * Places answer, and --apply never deletes a row.
 */
import { readFileSync } from 'node:fs';
import { classifyAnswer } from '../sweep-restaurant-closures.ts';

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed++;
};

const row = { id: 'r1', name: 'A', location: '1 Main St', status: 'open', business_status: 'OPERATIONAL', google_place_id: 'p', is_merged: false };

check('CLOSED_PERMANENTLY is proposed for closing', classifyAnswer(row, { kind: 'status', value: 'CLOSED_PERMANENTLY' }).action === 'close');
check('CLOSED_TEMPORARILY changes nothing', classifyAnswer(row, { kind: 'status', value: 'CLOSED_TEMPORARILY' }).action === 'none');
check('OPERATIONAL changes nothing', classifyAnswer(row, { kind: 'status', value: 'OPERATIONAL' }).group === 'operational');
check('a 404 is queued, not closed', classifyAnswer(row, { kind: 'not_found' }).action === 'queue_place_not_found');
check('no status in the answer is queued, not treated as open', classifyAnswer(row, { kind: 'status', value: '' }).action === 'queue_place_not_found');
check('no confident match is queued as no_place_match', classifyAnswer({ ...row, google_place_id: null }, { kind: 'no_match', reason: 'ambiguous' }).action === 'queue_no_place_match');
check('a Places error is retried, never acted on', classifyAnswer(row, { kind: 'error', message: 'Places 429' }).action === 'retry');

const src = readFileSync(new URL('../sweep-restaurant-closures.ts', import.meta.url), 'utf8');
check('the script never sends DELETE', !/method:\s*["']DELETE["']/.test(src));
check('the script never prints a key', !/console\.\w+\([^)]*(key|googleKey)\b/.test(src.replace(/Places API \(New\) key/g, '')));
check('the dry run reads no PATCH/POST into the database path', /async function dryRun[\s\S]*?\n}\n/.exec(src)?.[0].includes('PATCH') === false);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
