#!/usr/bin/env node
/**
 * A verified event check-in must be one the server measured (WEB-SEC-053).
 *
 * event_checkins accepts direct INSERT and UPDATE from the row's owner, so
 * without a guard a client can write is_verified = true and any distance and
 * skip checkin_to_event() altogether. The guard is a BEFORE trigger that puts
 * the server-owned columns back unless checkin_to_event() opened it with a
 * transaction-local set_config.
 *
 * What this suite pins, reading the NEWEST migration that defines each piece
 * (last wins, as on a fresh `supabase db push`):
 *   - the trigger exists and covers INSERT and UPDATE
 *   - the guard resets all four server-owned columns, and lets non-client
 *     roles through
 *   - checkin_to_event() opens the guard before its INSERT and closes it
 *     after, so a later statement in the same transaction is guarded again
 *   - the acos() argument is clamped: unclamped, a caller standing on the
 *     venue's own coordinates can get "input is out of range" from float
 *     rounding (reproduced against Postgres 16 with 41.5035, -93.7)
 *
 * Behaviour was exercised against a local Postgres 16 with Supabase-style
 * auth stubs when this landed: forged insert and forged PATCH both came back
 * unverified, the RPC still verified a fix 45m away, and service_role writes
 * passed. This file keeps the shape from regressing; it executes no SQL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const strip = (sql) => sql.replace(/^\s*--[^\n]*$/gm, '');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

function newestDefinition(re) {
  for (const f of [...files].reverse()) {
    const code = strip(readFileSync(join(DIR, f), 'utf8'));
    const m = re.exec(code);
    if (m) {
      const end = code.indexOf('\n$$;', m.index);
      return { file: f, body: code.slice(m.index, end === -1 ? undefined : end) };
    }
  }
  return { file: null, body: '' };
}

const guard = newestDefinition(/CREATE OR REPLACE FUNCTION public\.guard_event_checkin_verification\(/);
check('the guard function exists', guard.file !== null);
check('  lets service_role and migrations through',
  /auth\.role\(\)[^\n]*NOT IN \('authenticated', 'anon'\)[\s\S]*?RETURN NEW;/.test(guard.body));
check('  opens only on app.event_checkin', /current_setting\('app\.event_checkin', true\) = 'on'/.test(guard.body));
for (const col of ['is_verified', 'distance_from_venue_meters', 'checkin_latitude', 'checkin_longitude']) {
  check(`  resets ${col} on insert`, new RegExp(`NEW\\.${col} := (false|NULL);`).test(guard.body));
  check(`  keeps OLD.${col} on update`, new RegExp(`NEW\\.${col} := OLD\\.${col};`).test(guard.body));
}
check('  a changed event_id unverifies the row', /NEW\.event_id IS DISTINCT FROM OLD\.event_id/.test(guard.body));

const all = files.map((f) => strip(readFileSync(join(DIR, f), 'utf8'))).join('\n');
check('the trigger fires BEFORE INSERT OR UPDATE on event_checkins',
  /CREATE TRIGGER trg_guard_event_checkin_verification\s+BEFORE INSERT OR UPDATE ON public\.event_checkins\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_event_checkin_verification\(\)/.test(all));

const rpc = newestDefinition(/CREATE OR REPLACE FUNCTION (public\.)?checkin_to_event\(/);
check('checkin_to_event is defined', rpc.file !== null);
const open = rpc.body.indexOf("set_config('app.event_checkin', 'on', true)");
const insert = rpc.body.search(/INSERT INTO (public\.)?event_checkins/);
const close = rpc.body.indexOf("set_config('app.event_checkin', 'off', true)");
check(`  opens the guard before its insert (${rpc.file})`, open !== -1 && insert !== -1 && open < insert);
check('  closes it after', close !== -1 && close > insert);
check('  the acos argument is clamped to [-1, 1]', /acos\(\s*LEAST\(1\.0, GREATEST\(-1\.0,/.test(rpc.body));
check('  keeps its return shape', /'checkin_id'[\s\S]*'is_verified'[\s\S]*'distance_meters'/.test(rpc.body));

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
