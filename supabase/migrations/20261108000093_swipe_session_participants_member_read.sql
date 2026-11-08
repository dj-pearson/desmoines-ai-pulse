-- WEB-SEC-069: who is in a group swipe session is readable by that session's
-- members, its host and admins, not by anyone holding the anon key.
--
-- 20260506000011_swipe_sessions.sql created
--   "Anyone can read participants in active sessions" FOR SELECT USING (true)
-- with no TO clause, despite its name: every row of every session, active or
-- not, was readable by anon. A row is user_id + display_name + joined_at, so
-- the anon key listed which accounts went out together, under what name, and
-- when.
--
-- READERS, enumerated 2026-11-08:
--   * Android GroupSessionRemoteDataSource.fetchParticipants: filters on one
--     session_id, called only from GroupSessionViewModel.loadLobby, after
--     createSession (which inserts the host as a participant) or joinByCode
--     (which inserts the caller). Both paths return early without a signed-in
--     user, so every read comes from a member with auth.uid() set.
--   * iOS SwipeSessionService.fetchParticipants: defined, called by nothing
--     (no reference to it or to `participants` outside the service). iOS
--     guests insert an anon_id row but never read the table.
--   * web: no reference in src/.
--   * edge: only _shared/userDataTables.ts (export/delete, service role).
--   * get_swipe_session_matches and swipe_session_participant_guard are
--     SECURITY DEFINER and read the table as its owner; unaffected.
--   Neither client inserts with return=representation, and the own-row clause
--   below would cover it if one did.
--
-- BACKWARD COMPATIBILITY. The INSERT policy, the guard trigger, both RPCs and
-- every column are unchanged. The one behaviour that changes is a read of a
-- session the caller is not in, which no shipped client in this tree makes.
-- The repo history is shallow, so a binary older than the current
-- SwipeSessionService cannot be read here; if one listed participants as a
-- guest, it now shows an empty list (matches come from the RPC and are
-- unaffected).

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so the answer does not depend on the
-- read policies of the two tables it scans: the host branch reads
-- swipe_sessions, whose own USING (true) read (host_user_id for every
-- session) is the next thing to tighten, and an invoker helper would then
-- silently stop recognising hosts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_swipe_session_member(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.swipe_session_participants p
      WHERE p.session_id = p_session_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.swipe_sessions s
      WHERE s.id = p_session_id AND s.host_user_id = auth.uid()
    )
  );
$$;

-- Supabase's default privileges grant EXECUTE to anon explicitly, so revoking
-- from PUBLIC alone would leave it callable by anon (it would only ever
-- answer false, but there is no reason to expose it).
REVOKE ALL ON FUNCTION public.is_swipe_session_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_swipe_session_member(UUID) TO authenticated;

COMMENT ON FUNCTION public.is_swipe_session_member(UUID) IS
  'True when the caller is a signed-in participant or the host of the swipe session (WEB-SEC-069).';

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read participants in active sessions"
  ON public.swipe_session_participants;

DROP POLICY IF EXISTS "Members read their session's participants"
  ON public.swipe_session_participants;
CREATE POLICY "Members read their session's participants"
  ON public.swipe_session_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_swipe_session_member(session_id)
  );

DROP POLICY IF EXISTS "Admins read swipe session participants"
  ON public.swipe_session_participants;
CREATE POLICY "Admins read swipe session participants"
  ON public.swipe_session_participants FOR SELECT
  TO authenticated
  USING (public.is_admin());
