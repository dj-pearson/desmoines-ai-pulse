-- WEB-SEC-066: brewery trail check-ins are readable by their owner, not by anyone.
--
-- WHAT WAS WRONG. brewery_trail_checkins (20260228000005) carries user_id,
-- restaurant_id, checked_in_at, beer_name and rating. Next to the owner-read
-- policy it created "Public read checkin counts" as FOR SELECT USING (true)
-- with no TO clause. Policies are OR-ed, so the anon key that ships in every
-- client bundle could run
--
--     GET /rest/v1/brewery_trail_checkins?select=user_id,restaurant_id,checked_in_at
--
-- and get which breweries each account visited, and when. That is the same
-- location-history leak WEB-SEC-052 closed on event_checkins. The policy's name
-- promised counts; PostgREST has no way to grant a count without granting the
-- rows, and nothing ever read a count from this table anyway (below).
--
-- docs/RLS_AUDIT.md lists exactly four live policies on the table, one of them
-- this SELECT USING (true), so one DROP is enough.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the multi-release
-- changes "in a way that would deny reads the old client expects"). Readers
-- enumerated on 2026-11-08:
--   web      src/hooks/useBreweryTrail.ts useBreweryCheckins reads
--            .eq('user_id', user.id) - its own rows only, which the owner
--            policy still allows. Insert and update paths filter on the
--            caller's id too. No other file under src/ names the table.
--   iOS      no reference to brewery_trail_checkins anywhere under ios/.
--   Android  no reference to brewery_trail_checkins anywhere under android/.
--   edge     only _shared/userDataTables.ts (account export/erasure), which
--            runs as service_role and bypasses RLS.
--   SQL      no view, function or trigger reads it.
-- No shipped client reads another user's check-in, so no reader loses a row it
-- expects. INSERT and UPDATE policies are untouched.
--
-- "Users can view own checkins" is left as created (TO public, auth.uid() =
-- user_id); anon has no auth.uid(), so it already matches nothing for anon.
-- An admin read is added so support can see a user's trail, matching
-- event_checkins.

DROP POLICY IF EXISTS "Public read checkin counts" ON public.brewery_trail_checkins;

DROP POLICY IF EXISTS "Admins read all brewery checkins" ON public.brewery_trail_checkins;
CREATE POLICY "Admins read all brewery checkins"
  ON public.brewery_trail_checkins
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
