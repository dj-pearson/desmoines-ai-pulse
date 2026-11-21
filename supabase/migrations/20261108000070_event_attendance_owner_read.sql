-- WEB-SEC-067: event_attendance is readable only by its owner and admins.
--
-- "Users can view all attendance" (20250802043023) is FOR SELECT USING (true)
-- with no TO clause, so the anon key that ships in the client bundle can list
-- who is going to which event. This is the tightening that
-- 20260827000002_event_attendance_tallies.sql deferred until the last
-- cross-user reader had moved to the event_attendance_tallies aggregate.
--
-- Every reader, enumerated 2026-11-08:
--   src/hooks/useCommunityFeatures.ts  updateEventCheckIn   write, own row
--                                      getUserEventCheckIn  .eq('user_id', user.id)
--                                      getEventCheckIns     event_attendance_tallies RPC
--   src/hooks/useMyPlans.ts            upcoming + past      .eq('user_id', userId)
--   src/components/PrivacyControls.tsx data export          own rows
--   supabase/functions/_shared/userDataTables.ts            service role (bypasses RLS)
--   get_personalized_recommendations, get_user_weekly_digest_content,
--   archive_and_purge_events, purge_old_events              SECURITY DEFINER
--   ios/, android/                                          no reference
-- No view reads the table. No reader needs another user's rows, so this is a
-- single-release change: no shipped binary loses a read it relies on.
--
-- Owners keep SELECT through "Users can manage their own attendance"
-- (FOR ALL USING (auth.uid() = user_id)), which this migration leaves alone.
-- Counts keep working through event_attendance_tallies (SECURITY DEFINER,
-- counts only). Apply 20260827000002 first; supabase db push applies in order.

DROP POLICY IF EXISTS "Users can view all attendance" ON public.event_attendance;

DROP POLICY IF EXISTS "Admins read all event attendance" ON public.event_attendance;
CREATE POLICY "Admins read all event attendance"
  ON public.event_attendance
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
