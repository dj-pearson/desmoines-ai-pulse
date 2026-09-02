-- WEB-SEC-028 (with WEB-SEC-027): retire the second login throttle, the one
-- an anonymous caller drives.
--
-- Three throttles guarded sign-in, and two of them answered to the attacker:
--
--   1. An in-memory map in AuthContext. Per-browser, resets on reload, already
--      documented in that file as "bypassable so not authoritative". Harmless:
--      it can only inconvenience the person running it.
--   2. public.failed_auth_attempts + check_auth_rate_limit(), driven from the
--      browser by useAuthSecurity. THIS ONE. Its INSERT policy is
--      WITH CHECK (true), so five unauthenticated PostgREST calls naming a
--      victim's address blocked that address's login AND signup buttons for
--      fifteen minutes, repeatable forever.
--   3. public.login_attempts + the check-login-attempt edge function, written
--      by the service role. Kept, and hardened in the same commit.
--
-- The IP half of (2) never worked at all, which is how it survived review: the
-- client sends p_ip_address => 'client', the literal string, and inserts
-- ip_address => ''. So every row shared one bogus IP and the ip_attempts branch
-- of check_auth_rate_limit counted rows that had nothing to do with each other.
--
-- WHAT THIS MIGRATION DOES
--   * Drops the anonymous INSERT policy. Only the service role writes the table
--     from here, and nothing currently does, which is the point: the client
--     path in useAuthSecurity is removed in the same commit.
--   * Leaves the table, its columns, its admin SELECT policy and
--     check_auth_rate_limit() in place. Old rows stay readable in the admin
--     security views, and any caller of the RPC keeps getting an answer -- it
--     simply stops being fed by strangers.
--
-- IS THIS A TIGHTENING? It removes a write. Per CLAUDE.md that needs the write
-- to be one no shipped client legitimately performs, and it is:
--   grep -rn "failed_auth_attempts" ios/ android/  -> no matches
--   grep -rn "check_auth_rate_limit" ios/ android/ -> no matches
-- Both mobile binaries call neither the table nor the RPC, and the only web
-- writer is deleted in this commit. Verified 2026-09-02.

DROP POLICY IF EXISTS "System can insert failed auth attempts" ON public.failed_auth_attempts;

-- Explicit and named, so the next reader sees a decision rather than an absence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'failed_auth_attempts'
       AND policyname = 'failed_auth_attempts_service_role_insert'
  ) THEN
    CREATE POLICY "failed_auth_attempts_service_role_insert"
      ON public.failed_auth_attempts
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.failed_auth_attempts IS
'Historical failed-auth log. WEB-SEC-028: the anonymous INSERT policy was removed 2026-09-02 because five unauthenticated calls could lock any address out of login and signup. The live throttle is public.login_attempts, written only by the check-login-attempt edge function on the service role. Do not re-open this table to clients.';

COMMENT ON FUNCTION public.check_auth_rate_limit(text, text) IS
'WEB-SEC-028: no longer fed by any client. Retained so existing admin queries and old rows keep working; it is not the sign-in throttle. See check-login-attempt.';
