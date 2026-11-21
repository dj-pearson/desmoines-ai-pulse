-- WEB-SEC-052: event check-ins are readable by their owner, not by anyone.
--
-- WHAT WAS WRONG. event_checkins carries user_id, event_id, created_at and,
-- since 20251110000010, checkin_latitude / checkin_longitude /
-- distance_from_venue_meters - the GPS fix checkin_to_event() stores for the
-- caller. Its only SELECT policy was USING (true) with no TO clause, so the
-- anon key that ships in every client bundle could run
--
--     GET /rest/v1/event_checkins?select=user_id,event_id,created_at,checkin_latitude,checkin_longitude
--
-- and get where each account was, and when, for every check-in on the
-- platform. Joined to any public profile surface that is a stalking aid, not
-- a social feature.
--
-- THREE POLICY NAMES, because production is not guaranteed to match the
-- last-wins reading of this folder. docs/RLS_AUDIT.md lists all three as live
-- SELECT USING (true) policies on this table:
--     "Users can view public event checkins"   20250829222354
--     "Anyone can view event checkins"         20250830021136
--     "Anyone can view check-ins"              20251110000010
-- Policies are OR-ed, so leaving any one of them in place keeps the table
-- public. All three are dropped.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the multi-release
-- changes "in a way that would deny reads the old client expects"). Readers
-- enumerated on 2026-11-07:
--   web      src/hooks/useEventSocial.ts reads .eq('user_id', user.id) - its
--            own row only, which the new policy still allows.
--   iOS      no reference to event_checkins anywhere under ios/.
--   Android  no reference to event_checkins anywhere under android/.
--   edge     only _shared/userDataTables.ts (account export/erasure), which
--            runs as service_role and bypasses RLS.
--   SQL      checkin_to_event() and populate_event_live_stats() are SECURITY
--            DEFINER and are unaffected; per-event check-in counts come from
--            event_live_stats, which stays public.
-- No shipped client reads another user's check-in, so no reader loses a row it
-- expects. Inserts and updates are untouched.

DROP POLICY IF EXISTS "Users can view public event checkins" ON public.event_checkins;
DROP POLICY IF EXISTS "Anyone can view event checkins" ON public.event_checkins;
DROP POLICY IF EXISTS "Anyone can view check-ins" ON public.event_checkins;

DROP POLICY IF EXISTS "Users read own check-ins" ON public.event_checkins;
CREATE POLICY "Users read own check-ins"
  ON public.event_checkins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all check-ins" ON public.event_checkins;
CREATE POLICY "Admins read all check-ins"
  ON public.event_checkins
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
