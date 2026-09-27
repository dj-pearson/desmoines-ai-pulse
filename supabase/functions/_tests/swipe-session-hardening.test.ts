/**
 * Group Session server hardening (IOS-DD-DISCOVER-02).
 *
 * Pins three things in 20261012000002_swipe_sessions_identity_and_matches.sql:
 *   - a participant row is bound to the caller (the INSERT policy never tied
 *     user_id to auth.uid(), so anyone could add someone else);
 *   - get_swipe_session_matches runs as definer, which it must to see other
 *     members' likes, and so must check membership first or it hands any
 *     session's likes to anyone who has the id; it also skips merged, hidden
 *     and archived events;
 *   - the code generator draws the 36 characters evenly ((random()*35)::int
 *     rounded, halving 'A' and '9').
 */

import { assert, assertMatch } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const MIGRATION = 'supabase/migrations/20261012000002_swipe_sessions_identity_and_matches.sql';

/** SQL without -- comments, so a comment cannot satisfy an assertion. */
async function sql(): Promise<string> {
  const text = await Deno.readTextFile(new URL(MIGRATION, REPO));
  return text.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');
}

/** The body of CREATE ... FUNCTION public.<name>, up to its closing $$. */
function functionBody(text: string, name: string): string {
  const start = text.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`));
  assert(start >= 0, `${name} is not defined in ${MIGRATION}`);
  const open = text.indexOf('$$', start);
  const close = text.indexOf('$$', open + 2);
  return text.slice(start, close + 2);
}

Deno.test('the participant trigger binds user_id to the caller', async () => {
  const text = await sql();
  const body = functionBody(text, 'swipe_session_participant_guard');
  assertMatch(body, /NEW\.user_id\s*:=\s*auth\.uid\(\)/);
  assertMatch(body, /NEW\.anon_id\s*:=\s*NULL/);
  assertMatch(body, /length\(NEW\.anon_id\)\s*>\s*64/);
  assertMatch(body, /left\(nullif\(btrim\(NEW\.display_name\),\s*''\),\s*40\)/);
  assertMatch(text, /BEFORE INSERT ON public\.swipe_session_participants/);
});

Deno.test('matches are definer-run behind a membership check', async () => {
  const body = functionBody(await sql(), 'get_swipe_session_matches');
  assertMatch(body, /SECURITY DEFINER/);
  assertMatch(body, /IF NOT EXISTS \(\s*SELECT 1 FROM swipe_session_participants p\s+WHERE p\.session_id = p_session_id AND p\.user_id = auth\.uid\(\)/);
  assertMatch(body, /s\.host_user_id = auth\.uid\(\)/);
  // The check returns before the aggregate.
  assert(body.indexOf('auth.uid()') < body.indexOf('RETURN QUERY'), 'membership check must come first');
});

Deno.test('matches skip merged, hidden and archived events', async () => {
  const body = functionBody(await sql(), 'get_swipe_session_matches');
  assertMatch(body, /e\.is_merged IS NOT TRUE/);
  assertMatch(body, /e\.is_hidden IS NOT TRUE/);
  assertMatch(body, /e\.archived_at IS NULL/);
  assertMatch(body, /CLOSED_PERMANENTLY/);
});

Deno.test('session codes draw every character with equal weight', async () => {
  const body = functionBody(await sql(), 'generate_swipe_session_code');
  assertMatch(body, /floor\(random\(\)\s*\*\s*36\)::int\s*\+\s*1/);
  assert(!/\(random\(\)\s*\*\s*35\)::int/.test(body), 'the rounding draw is back');
  assertMatch(body, /'DSM-'/);
});
