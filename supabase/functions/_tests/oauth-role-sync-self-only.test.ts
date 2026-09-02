/**
 * sync_oauth_user_role is self-only (WEB-SEC-030).
 *
 * The function is SECURITY DEFINER with GRANT EXECUTE TO authenticated and took
 * p_user_id without comparing it to auth.uid(). Any signed-in user could name
 * another auth.users id and have the best role attached to that address written
 * into user_roles and profiles.user_role FOR THE ID THEY NAMED.
 *
 * Exploiting it needed a second auth.users row at the target's address, so it
 * was a hardening gap rather than a live hole -- and it is the last
 * client-triggerable role write, the one the 2026-06-12 lockdown missed because
 * the signature reads like a helper.
 *
 * These assert the migration source. A pgTAP case would be better and needs a
 * database; what can be checked without one is that the guard exists, that it
 * is positioned before any write, and that the signature did not change.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20260902000012_sync_oauth_user_role_self_only.sql';

Deno.test('the caller may only sync themselves', async () => {
  const sql = await read(MIGRATION);

  assert(
    /IF caller_id IS NULL OR caller_id <> p_user_id THEN/.test(sql),
    'the id must be compared to auth.uid()',
  );
  assert(/RAISE EXCEPTION/.test(sql), 'a mismatch must be an error, not a quiet no-op');
  assert(/ERRCODE = '42501'/.test(sql), 'insufficient_privilege is the honest code');
  assert(
    /caller_id UUID := auth\.uid\(\)/.test(sql),
    'the caller identity must come from the JWT, never from an argument',
  );
});

Deno.test('the guard runs before anything is written', async () => {
  // A check placed after the lookup would still let an attacker enumerate which
  // addresses carry an admin role by timing or by error text.
  const sql = await read(MIGRATION);
  const guard = sql.indexOf('RAISE EXCEPTION');
  const firstWrite = sql.indexOf('INSERT INTO public.user_roles');
  const firstRead = sql.indexOf('FROM auth.users');
  assert(guard > 0 && firstWrite > 0 && firstRead > 0);
  assert(guard < firstWrite, 'the guard must precede the write');
  assert(guard < firstRead, 'and precede the lookup');
});

Deno.test('a NULL auth.uid() is rejected too', async () => {
  // Anything with no JWT -- a backfill, a service-role script -- should write
  // user_roles directly rather than borrow a self-service function.
  const sql = await read(MIGRATION);
  assert(/caller_id IS NULL/.test(sql));
});

Deno.test('both ends of the email match must be confirmed', async () => {
  const sql = await read(MIGRATION);

  // The target: an unconfirmed row proves nothing about who holds the mailbox,
  // and the whole inheritance rule is "same email means same person".
  assert(
    /SELECT email, email_confirmed_at/.test(sql),
    'the target row must be checked for confirmation',
  );
  assert(/target_confirmed IS NULL/.test(sql), 'and an unconfirmed target must inherit nothing');

  // The source: otherwise an unconfirmed row created at an admin's address
  // could seed a role that is then inherited -- the same assumption attacked
  // from the other end.
  assert(
    /au\.email_confirmed_at IS NOT NULL/.test(sql),
    'the row the role is copied FROM must be confirmed',
  );
});

Deno.test('an unconfirmed target returns user rather than raising', async () => {
  // Being mid-signup is an ordinary state, not an attack, and every caller
  // already treats 'user' as "nothing to inherit". Raising here would surface
  // as a console error on a perfectly normal first login.
  const sql = await read(MIGRATION);
  const block = sql.slice(sql.indexOf('IF user_email IS NULL OR target_confirmed IS NULL'));
  assert(/RETURN 'user';/.test(block.slice(0, 500)));
});

Deno.test('the signature is unchanged, so shipped clients keep working', async () => {
  const sql = await read(MIGRATION);
  assert(
    /CREATE OR REPLACE FUNCTION public\.sync_oauth_user_role\(p_user_id UUID\)\s*\n\s*RETURNS TEXT/.test(sql),
    'same parameter, same return type -- removing p_user_id would be a breaking change',
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.sync_oauth_user_role\(UUID\) TO authenticated;/.test(sql),
    'the grant must be re-issued after CREATE OR REPLACE',
  );
  // Anchored on GRANT: an unanchored /TO public/ matches
  // "INSERT INTO public.user_roles" and fails on a correct migration.
  assertFalse(
    /GRANT[^;]*\bTO\s+(anon|public)\b/i.test(sql),
    'it must not become reachable without a session',
  );
});

Deno.test('an existing role is never overwritten', async () => {
  // Preserved from the original. A copy that could downgrade a root_admin would
  // be a different privilege bug in the opposite direction.
  const sql = await read(MIGRATION);
  assert(/IF current_user_role IS NOT NULL THEN\s*\n\s*RETURN current_user_role;/.test(sql));
});

Deno.test('the only client caller passes its own id', async () => {
  // This is what makes tightening the function safe: one caller, and it already
  // passes auth.uid(). If it ever changes, the guard turns a working call into
  // a 42501.
  const hook = await read('src/hooks/useAdminAuth.ts');
  const call = hook.slice(hook.indexOf("'sync_oauth_user_role'"));
  assert(
    /\{ p_user_id: user\.id \}/.test(call.slice(0, 200)),
    'useAdminAuth must pass the signed-in user id',
  );
});
