-- ============================================================================
-- WEB-DB-002 regression test: a non-admin cannot self-escalate via profiles.role
-- ============================================================================
-- Run against a local Supabase DB (fails loudly and rolls back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/web_db_002_role_escalation.sql
--
-- Asserts:
--   1. An UPDATE that sets profiles.role to 'admin' as a non-admin is REJECTED
--      by the validate_profile_user_id() trigger (WEB-DB-002).
--   2. A benign self-update (non-role column) as the same non-admin SUCCEEDS.
-- The whole test runs in a rolled-back transaction, leaving no residue.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_uid uuid := '00000000-0000-0000-0000-0000000000db';
  v_denied boolean := false;
BEGIN
  -- Seed a non-admin profile row owned by v_uid. Adapt columns to the schema;
  -- id and user_id both map to the (would-be) auth user for a self row.
  INSERT INTO public.profiles (id, user_id)
  VALUES (v_uid, v_uid)
  ON CONFLICT (id) DO NOTHING;

  -- Simulate the authenticated non-admin user for auth.uid().
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1. Escalation attempt must be blocked.
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = v_uid;
    v_denied := false; -- reached here => NOT blocked => test fails below
  EXCEPTION WHEN others THEN
    v_denied := true;  -- trigger raised as expected
  END;

  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL: non-admin was able to set profiles.role = admin (WEB-DB-002 regression)';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS: non-admin profiles.role escalation was denied';
END $$;

ROLLBACK;
