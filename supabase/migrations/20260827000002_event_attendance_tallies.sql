-- WEB-SEC-025: the last raw-tally read of public.event_attendance.
--
-- event_attendance carries user_id and its only SELECT policy is
--     "..." cmd=SELECT roles={public} USING (true)
-- so anyone holding the anon key that ships in the client bundle can enumerate
-- who is going to which event. The sweep in WEB-SEC-025 found eight tables with
-- this shape; event_attendance is one of the three that is also LOCATION-BEARING,
-- which makes it materially more sensitive than "who liked a photo".
--
-- The product's own UI already treats attendance as anonymous: EventCheckIn
-- renders four counts and never a name. So the exposure is not a feature being
-- paid for - it is the difference between what the UI shows and what the API
-- publishes.
--
-- ONE READ WAS BLOCKING THE FIX. Every client reference was enumerated:
--     src/hooks/useCommunityFeatures.ts  updateEventCheckIn      write
--                                        getUserEventCheckIn     own row
--                                        getEventCheckIns        RAW TALLY  <-
--     src/pages/ProfilePage.tsx:42,:148  .eq('user_id', user.id) own row
--     supabase/functions/_shared/userDataTables.ts               service role
--     ios/, android/                     no reference at all
-- getEventCheckIns selected `status` for every attendee of an event and counted
-- them in the browser. It leaks no name by itself, but it is the read that
-- depends on the permissive policy: tighten now and the attendee count silently
-- becomes 1, because a denied SELECT under RLS is an empty result, not an error.
--
-- This function is what makes closing that possible. It is additive and changes
-- no existing behaviour on its own.
--
-- ── THE TIGHTENING IS NOT IN THIS FILE, DELIBERATELY ─────────────────────────
--
-- CLAUDE.md's deprecation flow: add the new shape, switch the readers, THEN
-- retire the old. The web change that points getEventCheckIns at this function
-- ships in the same commit as this migration, but a migration applies when it is
-- pushed and Cloudflare Pages deploys separately - so tightening here would open
-- a window where the live bundle still reads the raw table and every event shows
-- one attendee.
--
-- The follow-up, once this release is deployed and the /events/:id check-in
-- counts are confirmed still correct:
--
--     DROP POLICY IF EXISTS "Public read event attendance" ON public.event_attendance;
--     CREATE POLICY "event_attendance_own_or_admin"
--       ON public.event_attendance FOR SELECT TO public
--       USING (
--         auth.uid() = user_id
--         OR EXISTS (SELECT 1 FROM public.user_roles
--                    WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin'))
--       );
--
-- (Confirm the existing policy's name from pg_policies before dropping it; the
-- name above is the shape, not a verified string.)
--
-- Unlike WEB-SEC-025's votes half, that step needs no mobile release: neither
-- shipped binary references this table. It needs one web deploy.

/**
 * Attendance counts for one event, by status.
 *
 * Returns counts and nothing else - no user_id, no row ids. Grouping is by the
 * raw `status` text rather than a fixed four-column shape, because the column is
 * plain text with no CHECK: a status the client does not know about still comes
 * back and can be surfaced, instead of being silently dropped by the aggregate.
 *
 * The caller sums the rows for a total, which is what the browser-side reduce it
 * replaces did (`total = data.length`, all statuses including not_going).
 */
CREATE OR REPLACE FUNCTION public.event_attendance_tallies(p_event_id uuid)
RETURNS TABLE (status text, attendee_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.status, count(*)::bigint
  FROM public.event_attendance a
  WHERE a.event_id = p_event_id
  GROUP BY a.status;
$$;

COMMENT ON FUNCTION public.event_attendance_tallies(uuid) IS
  'Per-status attendance counts for one event, without exposing who attends (WEB-SEC-025). Lets the SELECT policy on event_attendance be restricted to a user''s own rows.';

-- The counts are what the check-in UI displays to anonymous visitors today, so
-- anon keeps the access it already has. What it loses is the identities.
GRANT EXECUTE ON FUNCTION public.event_attendance_tallies(uuid) TO anon, authenticated;
