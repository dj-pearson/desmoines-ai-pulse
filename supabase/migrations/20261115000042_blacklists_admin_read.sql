-- WEB-SEC-074: restaurant_blacklist and hotel_blacklist are readable
-- by admins only, not by anyone holding the anon key.
--
-- WHAT WAS WRONG. Both tables had a SELECT policy of USING (true) with no TO
-- clause, so the bundled anon key could read every row, including blocked_by
-- (REFERENCES auth.users), which names the admin account behind each block,
-- plus the free-text reason an admin typed:
--
--     GET /rest/v1/restaurant_blacklist?select=blocked_by,reason,restaurant_name
--
--   restaurant_blacklist  "Public read access for blacklist"        (20260127000000)
--   hotel_blacklist       "Public read access for hotel_blacklist"  (20260217000002,
--                         inside a DO block; same name, so DROP POLICY IF
--                         EXISTS reaches it)
--
-- The comment on both said the read was "needed for search filtering". The
-- only filtering readers are search-new-restaurants and search-new-hotels,
-- which already refuse anyone but an admin or an API-key caller
-- (requireAdminOrApiKey) and then read with the anon key. They now read the
-- blacklist with the service role, in the same commit.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md lists tightening RLS among the
-- multi-release changes "in a way that would deny reads the old client
-- expects"). Readers enumerated on 2026-11-15:
--   web      GooglePlacesRestaurantTools / GooglePlacesHotelTools, mounted in
--            AdminContent; they read select('*') as the signed-in admin, and
--            writing the tables already required is_admin() (20260127000000,
--            20260924000001), so every account that can manage the list can
--            still read it.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     search-new-restaurants, search-new-hotels (above). Nothing else.
--   SQL      no function, view or trigger reads either table.
--   scripts  none.
-- No shipped binary reads these tables, so this is a single-release change.
-- DEPLOY ORDER: deploy the two edge functions before applying this migration.
-- In the other order the old functions read zero blacklist rows (the error
-- branch is "continue without filtering"), so an admin search would show
-- blocked places again until the deploy; nothing fails.
--
-- WHAT STAYS. INSERT, UPDATE and DELETE stay admin-only as they are. An admin
-- read is added, so PostgREST's delete-by-filter (unblock) keeps seeing the
-- rows it deletes.

DROP POLICY IF EXISTS "Public read access for blacklist" ON public.restaurant_blacklist;
DROP POLICY IF EXISTS "Public read access for hotel_blacklist" ON public.hotel_blacklist;

DROP POLICY IF EXISTS "Admins can read blacklist" ON public.restaurant_blacklist;
CREATE POLICY "Admins can read blacklist"
  ON public.restaurant_blacklist
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can read hotel_blacklist" ON public.hotel_blacklist;
CREATE POLICY "Admins can read hotel_blacklist"
  ON public.hotel_blacklist
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
