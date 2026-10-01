-- WEB-BE-050: the geocoding trigger never geocoded. Say what it does.
--
-- auto_geocode_location() has two halves. One maintains `geom` from latitude
-- and longitude, and it works. The other is this:
--
--     -- In production, this would call the geocode-location edge function
--     -- For now, we'll just log that geocoding is needed
--     RAISE NOTICE 'Location needs geocoding: % (ID: %)', NEW.location, NEW.id;
--
-- A NOTICE from a BEFORE trigger goes to the Postgres log and nowhere else.
-- Nothing reads it. So a row inserted with a location and no coordinates has
-- never been geocoded by this trigger, on any table, since 20251203000002.
--
-- THE COST OF THE NAME. CLAUDE.md told every reader "geocoding triggers
-- maintain lat/lng", and four separate nightly jobs were written anyway -
-- nightly-coordinate-backfill at 02:00, backfill-coordinates-nightly at 04:30,
-- data-quality-heal-nightly at 02:30 and data-quality-sweeper at 08:00 - all
-- re-geocoding the same rows. A function whose name promises work it does not
-- do is why nobody could tell which of those four was the owner.
--
-- NOT DROPPED, RENAMED. The geom half is load-bearing: every distance query and
-- every map marker reads that column, and it is the only thing keeping it in
-- sync with the numeric pair. So the dead branch goes, the function says what
-- it does, and the four triggers point at the new name.
--
-- auto_geocode_location() is KEPT rather than dropped. Dropping a function is
-- on the CLAUDE.md never-in-one-release list, and while nothing in this repo
-- references it by name once the triggers below are repointed, "nothing in this
-- repo" is not the same as nothing. It can go in a later release. It shares the
-- computation rather than a copy of it, so the two cannot diverge while both
-- exist.

-- The computation itself, as a plain function. Both trigger functions below
-- call it, so the deprecated name cannot drift from the live one - a trigger
-- function cannot delegate to another trigger function, because NEW is only
-- bound when Postgres invokes it AS a trigger.
--
-- double precision parameters: the columns are double precision on events and
-- attractions and real on restaurants, and both cast to it implicitly.
CREATE OR REPLACE FUNCTION public.geom_from_latlng(lat double precision, lng double precision)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN lat IS NULL OR lng IS NULL THEN NULL
    ELSE ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  END
$fn$;

COMMENT ON FUNCTION public.geom_from_latlng IS
  'PostGIS point for a lat/lng pair, or NULL when either is missing (WEB-BE-050).';

CREATE OR REPLACE FUNCTION public.sync_geom_from_latlng()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- The whole job. No geocoding happens here and none ever did; coordinates
  -- are set at ingest (supabase/functions/_shared/knownVenues.ts) and the
  -- nightly heal job is the safety net.
  NEW.geom := public.geom_from_latlng(NEW.latitude, NEW.longitude);
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.sync_geom_from_latlng IS
  'Keeps geom in sync with the latitude/longitude pair on INSERT and UPDATE. Does NOT geocode - that is the ingest path plus the nightly heal job (WEB-BE-050).';

-- Repoint the four triggers. DROP + CREATE rather than CREATE OR REPLACE
-- TRIGGER, which needs Postgres 14+ and gains nothing here: these fire BEFORE
-- the row is written, so a gap inside one transaction cannot leave a row with a
-- stale geom.
DROP TRIGGER IF EXISTS events_auto_geocode_trigger ON public.events;
CREATE TRIGGER events_auto_geocode_trigger
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_geom_from_latlng();

DROP TRIGGER IF EXISTS restaurants_auto_geocode_trigger ON public.restaurants;
CREATE TRIGGER restaurants_auto_geocode_trigger
  BEFORE INSERT OR UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.sync_geom_from_latlng();

DROP TRIGGER IF EXISTS attractions_auto_geocode_trigger ON public.attractions;
CREATE TRIGGER attractions_auto_geocode_trigger
  BEFORE INSERT OR UPDATE ON public.attractions
  FOR EACH ROW EXECUTE FUNCTION public.sync_geom_from_latlng();

DROP TRIGGER IF EXISTS playgrounds_auto_geocode_trigger ON public.playgrounds;
CREATE TRIGGER playgrounds_auto_geocode_trigger
  BEFORE INSERT OR UPDATE ON public.playgrounds
  FOR EACH ROW EXECUTE FUNCTION public.sync_geom_from_latlng();

-- The old name, kept for one release so nothing outside this repo breaks. It
-- delegates rather than duplicating the body, so the two cannot diverge.
CREATE OR REPLACE FUNCTION public.auto_geocode_location()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.geom := public.geom_from_latlng(NEW.latitude, NEW.longitude);
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.auto_geocode_location IS
  'DEPRECATED (WEB-BE-050): never geocoded; delegates to sync_geom_from_latlng. Safe to drop once no trigger outside this repo references it.';
