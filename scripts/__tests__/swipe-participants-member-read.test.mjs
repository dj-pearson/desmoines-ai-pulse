#!/usr/bin/env node
/**
 * swipe_session_participants is readable by the session's members, its host
 * and admins only (WEB-SEC-069).
 *
 * check-identity-reads already fails if a USING (true) read comes back. This
 * suite pins the parts it cannot see: the membership helper the policy calls.
 * As SECURITY INVOKER it works today (checked on Postgres 16: no recursion,
 * the inner scan only needs the caller's own row), but its host branch would
 * then read swipe_sessions under that table's RLS, and the moment that
 * USING (true) read is tightened, hosts would stop seeing their own lobby
 * with nothing failing loudly.
 *
 * Behaviour exercised on a local Postgres 16 with Supabase-style auth stubs
 * when this landed: before, anon read 4/4 rows and an outsider read another
 * session's 3; after, anon 0, host and member their own session only, the
 * outsider 0 until joining, admin all, guest (anon_id) insert and
 * INSERT ... RETURNING unchanged, re-apply a no-op. This file executes no SQL.
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

// Newest definition of the helper wins, as on a fresh `supabase db push`.
let file = null;
let fn = '';
let whole = '';
for (const f of [...files].reverse()) {
  const code = strip(readFileSync(join(DIR, f), 'utf8'));
  const m = /CREATE OR REPLACE FUNCTION public\.is_swipe_session_member\(/.exec(code);
  if (m) {
    const end = code.indexOf('$$;', code.indexOf('$$', m.index) + 2);
    file = f;
    fn = code.slice(m.index, end === -1 ? undefined : end);
    whole = code;
    break;
  }
}

check('is_swipe_session_member is defined', file !== null);
console.log(`        (newest definition: ${file})`);
check('helper is SECURITY DEFINER (independent of the scanned tables\' RLS)', /\bSECURITY DEFINER\b/.test(fn));
check('helper pins search_path', /SET search_path = public/.test(fn));
check('helper answers false without a signed-in caller', /auth\.uid\(\) IS NOT NULL AND/.test(fn));
check('helper counts a participant row of the caller', /p\.session_id = p_session_id AND p\.user_id = auth\.uid\(\)/.test(fn));
check('helper counts the host', /s\.id = p_session_id AND s\.host_user_id = auth\.uid\(\)/.test(fn));
check('helper is not executable by anon',
  /REVOKE ALL ON FUNCTION public\.is_swipe_session_member\(UUID\) FROM PUBLIC, anon;/.test(whole));

// The policy that uses it, in the same migration.
const member = /CREATE POLICY "Members read their session's participants"\s+ON public\.swipe_session_participants FOR SELECT\s+TO authenticated\s+USING \(([\s\S]*?)\);/.exec(whole);
check('member read policy exists, TO authenticated', member !== null);
check('  own row OR member of the session',
  member !== null && /user_id = auth\.uid\(\)\s+OR public\.is_swipe_session_member\(session_id\)/.test(member[1]));
check('the USING (true) read is dropped',
  /DROP POLICY IF EXISTS "Anyone can read participants in active sessions"\s+ON public\.swipe_session_participants;/.test(whole));
check('admin read policy exists',
  /CREATE POLICY "Admins read swipe session participants"[\s\S]*?USING \(public\.is_admin\(\)\);/.test(whole));

if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nswipe_session_participants member read: all checks passed.');
