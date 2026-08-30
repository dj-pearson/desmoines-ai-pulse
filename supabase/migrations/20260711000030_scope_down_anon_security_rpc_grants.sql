-- ============================================================================
-- WEB-DB-007: Scope down overbroad anon EXECUTE grants on security RPCs
-- ============================================================================
-- 20251204000000_security_features.sql granted EXECUTE to `anon, authenticated`
-- on several security/rate-limit RPCs. An anon (unauthenticated) grant means
-- anyone on the internet can invoke them directly via PostgREST.
--
-- Call-path verification (2026-07-11), grepping BOTH the web client (src/) and
-- the shipped mobile apps (ios/, android/) for actual `.rpc('<name>')` calls:
--
--   is_account_locked                -> NO call site anywhere      -> revoke anon
--   record_login_attempt             -> NO call site anywhere      -> revoke anon
--   check_password_reset_rate_limit  -> NO call site anywhere      -> revoke anon
--   record_password_reset_request    -> NO call site anywhere      -> revoke anon
--   check_magic_link_rate_limit      -> NO call site anywhere      -> revoke anon
--   validate_api_key                 -> NO call site anywhere      -> revoke anon
--   log_login_activity               -> CALLED pre-auth (failed-login logging,
--                                       src/hooks/useLoginActivity.ts:100) as anon
--                                       -> KEEP its anon grant (load-bearing)
--
-- Because none of the six revoked RPCs has any anon (or authenticated) caller in
-- either client, dropping the anon grant cannot break a shipped client — this is
-- a safe tightening, not a behavior change any client depends on. The
-- `authenticated` grants are left untouched (minimal blast radius). If these
-- functions are wired into a future login flow, re-grant explicitly then.
--
-- REVOKE IF EXISTS is guarded so this migration is a no-op where the function or
-- grant is already absent.
-- ============================================================================

DO $$
DECLARE
  fn_name text;
  fn_sig text;
  fns text[] := ARRAY[
    'is_account_locked',
    'record_login_attempt',
    'check_password_reset_rate_limit',
    'record_password_reset_request',
    'check_magic_link_rate_limit',
    'validate_api_key'
  ];
BEGIN
  FOREACH fn_name IN ARRAY fns LOOP
    -- Revoke from every overload of the function in the public schema.
    FOR fn_sig IN
      SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn_sig);
        RAISE NOTICE 'Revoked anon EXECUTE on %', fn_sig;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not revoke anon EXECUTE on %: %', fn_sig, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;
