-- WEB-SEC-073: user_follows and event_photo_reactions are readable by the
-- people on the row and by admins, not by anyone holding the anon key.
--
-- WHAT WAS WRONG. Both tables had a SELECT policy of USING (true) with no TO
-- clause, so the bundled anon key could list the whole social graph and every
-- photo reaction with its timestamp:
--
--     GET /rest/v1/user_follows?select=follower_id,following_id,created_at
--     GET /rest/v1/event_photo_reactions?select=user_id,photo_id,created_at
--
--   user_follows           "Anyone can view follows" (20251110000010)
--   event_photo_reactions  "Anyone can view photo reactions" (20250830013853,
--                          inside a DO block; same name, so DROP POLICY IF
--                          EXISTS reaches it)
--
-- check-identity-reads started seeing both in WEB-SEC-072, once it read
-- identity columns from the migrations and not only from types.ts.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the
-- multi-release changes "in a way that would deny reads the old client
-- expects"). Readers enumerated on 2026-11-15:
--   web      no file under src/ names either table (types.ts only).
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     no reference under supabase/functions/.
--   SQL      activity_feed's SELECT policy runs
--              EXISTS (SELECT 1 FROM user_follows
--                      WHERE follower_id = auth.uid() AND following_id = ...)
--            as the caller, so it only ever needs the caller's own follows
--            as follower, which the owner read below keeps.
--            get_activity_feed(p_user_id) is SECURITY INVOKER and reads
--            user_follows for p_user_id; activity_feed's own RLS already
--            limits its rows to the caller and the people the caller follows,
--            so a caller asking about someone else got nothing extra from
--            the open follows read either. No web, iOS or Android caller.
--            update_photo_likes_count() is a SECURITY DEFINER trigger that
--            reads NEW/OLD only.
--   realtime event_photo_reactions is in supabase_realtime (20250830013853),
--            which applies the same SELECT policies; no client subscribes to
--            it. user_follows is not in the publication.
-- No shipped client reads another user's row from either table, so this is a
-- single-release change.
--
-- WHAT STAYS. INSERT and DELETE policies are untouched. The owner reads also
-- keep PostgREST's unfollow and un-react working: a DELETE ... WHERE only
-- deletes rows the caller's SELECT policies let it see (see WEB-SEC-068).
-- event_photos.likes_count stays public, so per-photo totals do not need the
-- reaction rows. A follow is visible to both people on it (follower and
-- followed), so a "your followers" list stays possible; nobody else sees it.

DROP POLICY IF EXISTS "Anyone can view follows" ON public.user_follows;
DROP POLICY IF EXISTS "Anyone can view photo reactions" ON public.event_photo_reactions;

DROP POLICY IF EXISTS "Users read follows they are part of" ON public.user_follows;
CREATE POLICY "Users read follows they are part of"
  ON public.user_follows
  FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "Admins read all follows" ON public.user_follows;
CREATE POLICY "Admins read all follows"
  ON public.user_follows
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users read own photo reactions" ON public.event_photo_reactions;
CREATE POLICY "Users read own photo reactions"
  ON public.event_photo_reactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all photo reactions" ON public.event_photo_reactions;
CREATE POLICY "Admins read all photo reactions"
  ON public.event_photo_reactions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
