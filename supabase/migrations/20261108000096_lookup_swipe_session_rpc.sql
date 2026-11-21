-- WEB-SEC-070, slice 1 of 3: resolve a group swipe session's join code
-- without reading swipe_sessions directly.
--
-- swipe_sessions has "Anyone can read swipe sessions by code" FOR SELECT
-- USING (true) with no TO clause (20260506000011), so the anon key lists every
-- session ever hosted: host_user_id, code, mode, filter_context, timing. The
-- policy exists because joining by code needs a non-member to turn a code into
-- a session id, and both shipped apps do that with a direct table read:
--   * Android GroupSessionRemoteDataSource.fetchByCode (signed-in joiner,
--     before the participant insert; also after createSession, as the host).
--   * iOS SwipeSessionService.lookupSession (signed in, or a guest with no
--     session at all; filters status = active and expires_at > now()).
-- So the policy cannot be tightened in this release (CLAUDE.md, deprecation
-- flow). This migration adds the replacement path only:
--
--   lookup_swipe_session(p_code) -> zero or one row, the columns both apps
--   decode (id, code, host_user_id, mode, status, expires_at, ended_at,
--   created_at). It never returns filter_context, and it returns host_user_id
--   only to the host; anyone else gets NULL there. Android decides "am I the
--   host" by comparing host_user_id to its own uid and iOS keeps it optional,
--   so a NULL reads as "not the host", which is the truth for a joiner.
--   Every status is returned, not only active, so Android can keep saying
--   "That session has ended or expired" instead of "No session found".
--
-- Next (handoff in docs/improvement-loops/lanes/security.md):
--   2. iOS lookupSession and Android fetchByCode call this RPC (Android's
--      SwipeSession.hostUserId becomes nullable); hosts keep reading their own
--      rows directly.
--   3. Once MIN_SUPPORTED_APP_VERSION excludes the binaries that read the
--      table by code, replace the USING (true) policy with host-or-member
--      (is_swipe_session_member) plus admin.
--
-- BACKWARD COMPATIBILITY. Additive: one new function, no policy, column or
-- existing function changed.

CREATE OR REPLACE FUNCTION public.lookup_swipe_session(p_code TEXT)
RETURNS TABLE (
  id UUID,
  code TEXT,
  host_user_id UUID,
  mode TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.code,
    CASE WHEN auth.uid() IS NOT NULL AND s.host_user_id = auth.uid()
      THEN s.host_user_id END,
    s.mode,
    s.status,
    s.expires_at,
    s.ended_at,
    s.created_at
  FROM public.swipe_sessions s
  -- Codes are DSM-XXXX. Normalise the way both apps already do (trim, upper)
  -- and refuse anything long enough to be something other than a code.
  WHERE p_code IS NOT NULL
    AND length(p_code) <= 16
    AND s.code = upper(btrim(p_code))
  LIMIT 1;
$$;

-- Guests join iOS sessions with no auth session, so anon must be able to
-- resolve a code. The function answers one code at a time and never lists.
REVOKE ALL ON FUNCTION public.lookup_swipe_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_swipe_session(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_swipe_session(TEXT) IS
  'Resolves a swipe session join code to the session (host_user_id only for the host, never filter_context). Replaces the direct swipe_sessions read by code (WEB-SEC-070).';
