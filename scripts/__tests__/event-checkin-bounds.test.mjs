#!/usr/bin/env node
/**
 * checkin_to_event() bounds what a made-up GPS fix can earn (WEB-SEC-055).
 *
 * A client-reported position can never be proven genuine. What the RPC can do
 * is refuse nonsense, refuse volume, and refuse to verify a check-in to an
 * event that is not on. This suite pins those three on the NEWEST migration
 * that defines the function (last wins, as on a fresh `supabase db push`).
 *
 * The coordinate check has to run BEFORE the distance is computed, and this is
 * not only tidiness. The WEB-SEC-053 clamp, LEAST(1.0, GREATEST(-1.0, x)),
 * turns a NaN argument into 1.0, because Postgres sorts NaN above every
 * number: acos(1.0) = 0, so p_latitude = 'NaN' came back VERIFIED at 0 m from
 * any venue in the city. Reproduced on Postgres 16 against migration
 * 20261107000090 before the fix.
 *
 * Behaviour exercised on a local Postgres 16 with Supabase-style auth stubs
 * when this landed: lat 91, lng -181, NaN, Infinity and NULL all raised 22023;
 * an event 3 days past and one 9 hours into a no-end-date show came back
 * unverified at 0 m; a festival with end_date tomorrow, a time_tbd event and
 * an event starting in 90 minutes verified; the 11th distinct check-in inside
 * an hour raised 54000 while a re-check-in to one of the first ten still
 * worked. This file keeps the shape from regressing; it executes no SQL.
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

let file = null;
let body = '';
for (const f of [...files].reverse()) {
  const code = strip(readFileSync(join(DIR, f), 'utf8'));
  const m = /CREATE OR REPLACE FUNCTION (public\.)?checkin_to_event\(/.exec(code);
  if (m) {
    const end = code.indexOf('\n$$;', m.index);
    file = f;
    body = code.slice(m.index, end === -1 ? undefined : end);
    break;
  }
}

check('checkin_to_event is defined', file !== null);
console.log(`        (newest definition: ${file})`);

const acos = body.indexOf('acos(');
const insert = body.search(/INSERT INTO (public\.)?event_checkins/);

// 1. Coordinates.
const range = body.search(/NOT \(p_latitude BETWEEN -90 AND 90\)/);
check('rejects latitude outside [-90, 90]', range !== -1);
check('rejects longitude outside [-180, 180]', /NOT \(p_longitude BETWEEN -180 AND 180\)/.test(body));
check('rejects NULL coordinates', /p_latitude IS NULL OR p_longitude IS NULL/.test(body));
check('  raises 22023, not a stored junk row', /RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023'/.test(body));
check('  before acos() sees the value (NaN would clamp to a verified 0 m)',
  range !== -1 && acos !== -1 && range < acos);

// 2. Rate limit.
const lock = body.search(/pg_advisory_xact_lock\(hashtext\('checkin_to_event:' \|\| v_user_id::text\)\)/);
const count = body.search(/SELECT count\(\*\) INTO v_recent\s+FROM public\.event_checkins/);
const limit = body.search(/IF v_recent >= 10 THEN\s+RAISE EXCEPTION 'Too many check-ins, try again later' USING ERRCODE = '54000'/);
check('per-user advisory lock serialises the count and the insert', lock !== -1 && lock < count);
check('counts this user\'s check-ins in the last hour',
  /WHERE user_id = v_user_id[\s\S]*?created_at > NOW\(\) - INTERVAL '1 hour'/.test(body));
check('  excluding the event being checked in to (a re-check-in is an upsert)',
  /AND event_id <> p_event_id/.test(body));
check('  raises 54000 at 10, before the insert', limit !== -1 && insert !== -1 && limit < insert);

// 3. Time window.
check('start is event_start_utc, falling back to date',
  /v_start := COALESCE\(v_event\.event_start_utc, v_event\.date\);/.test(body));
check('opens 2 hours before the start',
  /v_window_open := v_start - INTERVAL '2 hours';/.test(body));
check('closes 2 hours after end_date, or start + 6h when end_date is NULL',
  /v_window_close := COALESCE\(v_event\.end_date, v_start \+ INTERVAL '6 hours'\) \+ INTERVAL '2 hours';/.test(body));
check('time_tbd widens to the whole day',
  /IF COALESCE\(v_event\.time_tbd, false\) THEN\s+v_window_open := v_start - INTERVAL '12 hours';\s+v_window_close := v_start \+ INTERVAL '36 hours';/.test(body));
check('is_verified needs distance AND the window',
  /v_is_verified := v_distance_meters <= 500\s+AND v_start IS NOT NULL\s+AND NOW\(\) BETWEEN v_window_open AND v_window_close;/.test(body));

// Backward compatibility.
check('signature unchanged',
  /checkin_to_event\(\s*p_event_id UUID,\s*p_latitude REAL,\s*p_longitude REAL,\s*p_message TEXT DEFAULT NULL\s*\)\s*RETURNS JSONB/.test(body));
check('return shape unchanged', /'checkin_id'[\s\S]*'is_verified'[\s\S]*'distance_meters'/.test(body));
const grant = readFileSync(join(DIR, file ?? files[0]), 'utf8');
check('grant to authenticated kept in the same migration',
  /GRANT EXECUTE ON FUNCTION public\.checkin_to_event\(UUID, REAL, REAL, TEXT\) TO authenticated;/.test(grant));

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
