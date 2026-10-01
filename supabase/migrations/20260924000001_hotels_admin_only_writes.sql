-- Plan & Stay D2: only admins may write hotels, event_hotels and hotel_blacklist.
--
-- 20260216000000_create_hotels.sql and 20260217000002 created INSERT/UPDATE/
-- DELETE policies of `auth.role() = 'authenticated'` with the comment "admin
-- will be enforced at app level". It never was at the database: any signed-in
-- visitor could PATCH a hotel's booking/affiliate URL or delete rows straight
-- through PostgREST (confirmed live in docs/RLS_AUDIT.md).
--
-- This tightens write access only. Public SELECT policies are untouched, so
-- every read path (web, iOS, Android) is unaffected. The only client writers
-- are admin screens (HotelEditDialog, HotelManager via useHotels,
-- GooglePlacesHotelTools under AdminContent), which run as admins.
-- search-new-hotels only reads. Service-role callers bypass RLS.
--
-- Pattern matches 20260511000000_fix_security_lints.sql (is_admin()).
-- Verify after push: a non-admin PATCH on /rest/v1/hotels?id=eq.<id> must
-- update 0 rows; an admin PATCH must still succeed.

-- hotels -------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert hotels" ON public.hotels;
DROP POLICY IF EXISTS "Authenticated users can update hotels" ON public.hotels;
DROP POLICY IF EXISTS "Authenticated users can delete hotels" ON public.hotels;

DROP POLICY IF EXISTS "Admins can insert hotels" ON public.hotels;
CREATE POLICY "Admins can insert hotels" ON public.hotels
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update hotels" ON public.hotels;
CREATE POLICY "Admins can update hotels" ON public.hotels
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete hotels" ON public.hotels;
CREATE POLICY "Admins can delete hotels" ON public.hotels
  FOR DELETE USING (public.is_admin());

-- event_hotels ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert event_hotels" ON public.event_hotels;
DROP POLICY IF EXISTS "Authenticated users can update event_hotels" ON public.event_hotels;
DROP POLICY IF EXISTS "Authenticated users can delete event_hotels" ON public.event_hotels;

DROP POLICY IF EXISTS "Admins can insert event_hotels" ON public.event_hotels;
CREATE POLICY "Admins can insert event_hotels" ON public.event_hotels
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update event_hotels" ON public.event_hotels;
CREATE POLICY "Admins can update event_hotels" ON public.event_hotels
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete event_hotels" ON public.event_hotels;
CREATE POLICY "Admins can delete event_hotels" ON public.event_hotels
  FOR DELETE USING (public.is_admin());

-- hotel_blacklist (same open pattern; only GooglePlacesHotelTools writes it) --
DROP POLICY IF EXISTS "Authenticated users can insert hotel_blacklist" ON public.hotel_blacklist;
DROP POLICY IF EXISTS "Authenticated users can update hotel_blacklist" ON public.hotel_blacklist;
DROP POLICY IF EXISTS "Authenticated users can delete hotel_blacklist" ON public.hotel_blacklist;

DROP POLICY IF EXISTS "Admins can insert hotel_blacklist" ON public.hotel_blacklist;
CREATE POLICY "Admins can insert hotel_blacklist" ON public.hotel_blacklist
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update hotel_blacklist" ON public.hotel_blacklist;
CREATE POLICY "Admins can update hotel_blacklist" ON public.hotel_blacklist
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete hotel_blacklist" ON public.hotel_blacklist;
CREATE POLICY "Admins can delete hotel_blacklist" ON public.hotel_blacklist
  FOR DELETE USING (public.is_admin());
