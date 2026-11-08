#!/usr/bin/env node
/**
 * lookup_swipe_session(code) is the join-by-code path that lets the
 * swipe_sessions USING (true) read be retired (WEB-SEC-070, slice 1).
 *
 * The parts pinned here are the ones that would fail quietly:
 *   * SECURITY DEFINER. As an invoker function it works today, because the
 *     table is still world-readable, and then returns nothing for every joiner
 *     the day that read is tightened (slice 3).
 *   * host_user_id only for the host, never filter_context. Returning the bare
 *     column would hand the host's account id to anyone holding a code, which
 *     is the exposure the story is about.
 *
 * Behaviour exercised when this landed (PGlite, the three swipe migrations
 * plus this one, Supabase-style auth stubs): anon resolves 'dsm-ab12 ' to
 * DSM-AB12 with host_user_id NULL, another user gets NULL, the host gets their
 * own id, an ended session resolves with status 'ended', unknown/NULL/over-long
 * input gives no row, re-apply is a no-op, and after replacing the USING (true)
 * read with host-or-member the table gives anon 0 rows while the RPC still
 * resolves. This file executes no SQL.
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

// Newest definition wins, as on a fresh `supabase db push`.
let file = null;
let fn = '';
let whole = '';
for (const f of [...files].reverse()) {
  const code = strip(readFileSync(join(DIR, f), 'utf8'));
  const m = /CREATE OR REPLACE FUNCTION public\.lookup_swipe_session\(/.exec(code);
  if (m) {
    const end = code.indexOf('$$;', code.indexOf('$$', m.index) + 2);
    file = f;
    fn = code.slice(m.index, end === -1 ? undefined : end);
    whole = code;
    break;
  }
}

check('lookup_swipe_session is defined', file !== null);
console.log(`        (newest definition: ${file})`);
check('signature is (p_code TEXT)', /lookup_swipe_session\(p_code TEXT\)/.test(fn));
check('is SECURITY DEFINER (still resolves once the table read is tightened)', /\bSECURITY DEFINER\b/.test(fn));
check('pins search_path', /SET search_path = public/.test(fn));

const returns = /RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/.exec(fn);
const cols = returns ? returns[1].split(',').map((c) => c.trim().split(/\s+/)[0]) : [];
check('returns the columns both apps decode',
  ['id', 'code', 'host_user_id', 'mode', 'status', 'expires_at', 'ended_at', 'created_at'].every((c) => cols.includes(c)),
  cols.join(','));
check('never returns filter_context', !cols.includes('filter_context') && !/\bfilter_context\b/.test(fn));
check('host_user_id only when the caller is the host',
  /CASE WHEN auth\.uid\(\) IS NOT NULL AND s\.host_user_id = auth\.uid\(\)\s+THEN s\.host_user_id END/.test(fn));
check('no bare s.host_user_id in the select list',
  !/SELECT\s+s\.id,\s+s\.code,\s+s\.host_user_id,/.test(fn));
check('matches one normalised code, bounded input',
  /length\(p_code\) <= 16/.test(fn) && /s\.code = upper\(btrim\(p_code\)\)/.test(fn) && /LIMIT 1/.test(fn));
check('PUBLIC revoked', /REVOKE ALL ON FUNCTION public\.lookup_swipe_session\(TEXT\) FROM PUBLIC;/.test(whole));
check('anon and authenticated may call it (iOS guests join signed out)',
  /GRANT EXECUTE ON FUNCTION public\.lookup_swipe_session\(TEXT\) TO anon, authenticated;/.test(whole));

if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nlookup_swipe_session: all checks passed.');
