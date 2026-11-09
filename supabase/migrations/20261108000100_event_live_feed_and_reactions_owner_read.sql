-- WEB-SEC-071: event_live_feed and event_discussion_reactions are readable by
-- the row's owner and admins, not by anyone holding the anon key.
--
-- WHAT WAS WRONG. WEB-SEC-052 (20261107000001) made event_checkins owner-only
-- so the anon key could no longer list who checked in where, and when. The
-- same rows were still public one table over: the AFTER INSERT trigger
-- trigger_create_feed_on_checkin (20250829222354, create_live_feed_item(),
-- SECURITY DEFINER) copies every check-in into event_live_feed as
-- (event_id, user_id, content_type = 'checkin', created_at), and
-- event_live_feed's only SELECT policy is USING (true) with no TO clause:
--
--     GET /rest/v1/event_live_feed?select=user_id,event_id,created_at&content_type=eq.checkin
--
-- answers the question WEB-SEC-052 closed, for every check-in made since. The
-- GPS columns are not copied; the who, where-as-in-which-event and when are.
--
-- event_discussion_reactions has the same shape as the likes tables
-- WEB-SEC-068 closed (user_id, discussion_id, reaction_type, created_at) and
-- the same USING (true) read, "Anyone can view discussion reactions". It was
-- missed then because it is named "reactions", not "likes".
--
-- docs/RLS_AUDIT.md lists exactly these two as the tables' only public SELECT
-- policies.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the
-- multi-release changes "in a way that would deny reads the old client
-- expects"). Readers enumerated on 2026-11-08:
--   web      event_live_feed: no file under src/ names it.
--            event_discussion_reactions: src/hooks/useEventSocial.ts upserts
--            the caller's own row ({ discussion_id, user_id: user.id }) and
--            never selects. The owner read below covers whatever an
--            INSERT ... ON CONFLICT DO UPDATE has to see.
--   iOS      no reference to either table under ios/.
--   Android  no reference to either table under android/.
--   edge     only _shared/userDataTables.ts (account export and erasure),
--            which runs as service_role and bypasses RLS.
--   SQL      create_live_feed_item() writes event_live_feed and is SECURITY
--            DEFINER; nothing in SQL reads either table, and no view does.
--   realtime both tables are in supabase_realtime, which applies the same
--            SELECT policies; no client subscribes to either.
-- No shipped client reads another user's row from either table, so this is a
-- single-release change.
--
-- WHAT STAYS. INSERT, UPDATE and DELETE policies are untouched, and so is the
-- trigger: an owner still sees their own feed rows, and per-event totals come
-- from event_live_stats and event_discussions.likes_count, which stay public.
-- An admin read is added on both, matching event_checkins.

DROP POLICY IF EXISTS "Anyone can view event live feed" ON public.event_live_feed;
DROP POLICY IF EXISTS "Anyone can view discussion reactions" ON public.event_discussion_reactions;

DROP POLICY IF EXISTS "Users read own live feed items" ON public.event_live_feed;
CREATE POLICY "Users read own live feed items"
  ON public.event_live_feed
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all live feed items" ON public.event_live_feed;
CREATE POLICY "Admins read all live feed items"
  ON public.event_live_feed
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users read own discussion reactions" ON public.event_discussion_reactions;
CREATE POLICY "Users read own discussion reactions"
  ON public.event_discussion_reactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all discussion reactions" ON public.event_discussion_reactions;
CREATE POLICY "Admins read all discussion reactions"
  ON public.event_discussion_reactions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
