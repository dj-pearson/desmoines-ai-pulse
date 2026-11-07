-- ============================================================================
-- Regression test: contact_submissions rejects a user_id that is not the caller
-- ============================================================================
-- Run against a local Supabase DB (fails loudly and rolls back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/contact_submissions_user_id_check.sql
--
-- Needs at least two rows in auth.users (user_id references auth.users, so the
-- forged id has to be a real user for the old policy to have accepted it).
--
-- Asserts (migration 20261101000002):
--   1. anon, user_id NULL                -> accepted (signed-out contact form)
--   2. anon, user_id = some real user    -> REJECTED
--   3. signed-in, user_id = own id       -> accepted
--   4. signed-in, user_id = another user -> REJECTED
-- The whole test runs in a rolled-back transaction, leaving no residue.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_me uuid;
  v_victim uuid;
  v_denied boolean;
BEGIN
  SELECT id INTO v_me FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_victim FROM auth.users WHERE id <> v_me ORDER BY created_at LIMIT 1;
  IF v_me IS NULL OR v_victim IS NULL THEN
    RAISE EXCEPTION 'SETUP: need two rows in auth.users to run this test';
  END IF;

  -- 1 and 2: anonymous caller.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);

  INSERT INTO public.contact_submissions (name, email, message, user_id)
  VALUES ('Anon', 'anon@example.com', 'signed-out message', NULL);

  BEGIN
    INSERT INTO public.contact_submissions (name, email, message, user_id)
    VALUES ('Anon', 'attacker@example.com', 'forged', v_victim);
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL: anon inserted a contact_submissions row with another user''s user_id';
  END IF;

  -- 3 and 4: signed-in caller.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.contact_submissions (name, email, message, user_id)
  VALUES ('Me', 'me@example.com', 'my own message', v_me);

  BEGIN
    INSERT INTO public.contact_submissions (name, email, message, user_id)
    VALUES ('Me', 'me@example.com', 'forged', v_victim);
    v_denied := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL: signed-in user inserted a contact_submissions row with another user''s user_id';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS: contact_submissions.user_id must be NULL or the caller';
END $$;

ROLLBACK;
