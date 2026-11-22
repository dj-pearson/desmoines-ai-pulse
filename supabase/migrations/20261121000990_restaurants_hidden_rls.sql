-- WEB-FEAT-103, part 2: hide a hidden restaurant from everyone but admins.
--
-- Split out of 20261121000140 and sorted last: it refuses to apply when row
-- level security is off on public.restaurants (a restrictive policy would
-- then hide nothing while the admin is told the row is hidden). No migration
-- in this repo enables RLS on restaurants, so whether it is on in production
-- has to be checked there first:
--   select relrowsecurity from pg_class where oid = 'public.restaurants'::regclass;
-- Until this applies, Hide keeps the row out of every list that filters
-- hidden_at (sitemaps, promotion) and the do-not-ingest list still works,
-- but a direct anon read of the row is not refused.

-- A restrictive policy does nothing on a table without RLS, and then hidden
-- rows would stay public while the admin is told they are hidden. Refuse
-- rather than ship that.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.restaurants'::regclass) THEN
    RAISE EXCEPTION 'WEB-FEAT-103: row level security is off on public.restaurants, so hiding a restaurant would not hide it';
  END IF;
END
$$;

DROP POLICY IF EXISTS "Hidden restaurants are admin-only" ON public.restaurants;
CREATE POLICY "Hidden restaurants are admin-only"
  ON public.restaurants
  AS RESTRICTIVE
  FOR SELECT
  USING (hidden_at IS NULL OR (SELECT public.is_admin()));

