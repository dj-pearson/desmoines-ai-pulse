-- WEB-SEC-068: who liked or voted on what is readable by that user and admins,
-- not by anyone holding the anon key.
--
-- WHAT WAS WRONG. Three tables pair a user_id with the piece of content that
-- user reacted to, and each had a SELECT policy of USING (true) with no TO
-- clause, so the anon key that ships in every client bundle could run
--
--     GET /rest/v1/photo_likes?select=user_id,photo_id,created_at
--
-- and walk every account's likes and votes, with timestamps:
--   discussion_likes       "Anyone can view discussion likes"   (20251110000010)
--   photo_likes            "Anyone can view photo likes"        (20251110000010)
--   content_helpful_votes  "Users can view all helpful votes"   (20250802043023)
-- docs/RLS_AUDIT.md lists exactly these as the tables' only public SELECT
-- policies. Displayed totals do not need the rows: event_discussions and
-- event_photos carry their own likes_count columns.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the
-- multi-release changes "in a way that would deny reads the old client
-- expects"). Readers enumerated on 2026-11-08:
--   web      no file under src/ names any of the three tables.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     only _shared/userDataTables.ts (account export and erasure),
--            which runs as service_role and bypasses RLS.
--   SQL      toggle_discussion_like and update_user_reputation read them, and
--            both are SECURITY DEFINER. No view reads them.
-- No client reads another user's like or vote, so this is a single-release
-- change: no shipped binary loses a row it relies on.
--
-- OWNER READS. content_helpful_votes already has "Users can manage their own
-- votes" (FOR ALL USING (auth.uid() = user_id)), which covers SELECT. The two
-- likes tables had only INSERT and DELETE policies for the owner, and the
-- public read was the only thing letting a user see, or filter on, their own
-- rows. Postgres applies SELECT policies to the rows a DELETE ... WHERE reads,
-- so dropping the public read alone would turn PostgREST's
-- `.delete().eq('photo_id', x)` unlike into a silent zero-row delete. Each
-- likes table therefore gets an owner SELECT. INSERT and DELETE policies are
-- untouched. An admin read is added on all three for moderation and support,
-- matching event_checkins and event_attendance.

DROP POLICY IF EXISTS "Anyone can view discussion likes" ON public.discussion_likes;
DROP POLICY IF EXISTS "Anyone can view photo likes" ON public.photo_likes;
DROP POLICY IF EXISTS "Users can view all helpful votes" ON public.content_helpful_votes;

DROP POLICY IF EXISTS "Users read own discussion likes" ON public.discussion_likes;
CREATE POLICY "Users read own discussion likes"
  ON public.discussion_likes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own photo likes" ON public.photo_likes;
CREATE POLICY "Users read own photo likes"
  ON public.photo_likes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all discussion likes" ON public.discussion_likes;
CREATE POLICY "Admins read all discussion likes"
  ON public.discussion_likes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read all photo likes" ON public.photo_likes;
CREATE POLICY "Admins read all photo likes"
  ON public.photo_likes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read all helpful votes" ON public.content_helpful_votes;
CREATE POLICY "Admins read all helpful votes"
  ON public.content_helpful_votes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
