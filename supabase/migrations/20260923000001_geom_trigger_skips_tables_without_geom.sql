-- Every write to attractions and playgrounds failed after 20260919000005.
--
-- That migration pointed the *_auto_geocode_trigger on events, restaurants,
-- attractions and playgrounds at sync_geom_from_latlng(), which assigns
-- NEW.geom. Only events and restaurants have a geom column. On the other two
-- every INSERT and UPDATE raised 42703 (record "new" has no field "geom"),
-- which is how it surfaced: 20260919000008 backfills attractions.slug and
-- could not update a single row.
--
-- The functions now look up the column on the table that fired them and do
-- nothing when it is absent, which is exactly what those two tables had before
-- (the old auto_geocode_location only raised a NOTICE). Giving them a geom
-- column is a separate decision; this only stops the writes failing.
--
-- Applied to production directly on 2026-09-23 as a hotfix, ahead of this
-- file, because db push could not get past 20260919000008 to reach it. Both
-- statements are CREATE OR REPLACE, so re-running here is a no-op.

CREATE OR REPLACE FUNCTION public.sync_geom_from_latlng()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- PL/pgSQL plans each statement on first execution, so the assignment below
  -- is never compiled against a row type that lacks geom.
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = TG_RELID AND attname = 'geom' AND NOT attisdropped
  ) THEN
    NEW.geom := public.geom_from_latlng(NEW.latitude, NEW.longitude);
  END IF;
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.sync_geom_from_latlng IS
  'Keeps geom in sync with the latitude/longitude pair on INSERT and UPDATE, on tables that have a geom column; a no-op elsewhere. Does NOT geocode - that is the ingest path plus the nightly heal job (WEB-BE-050).';

CREATE OR REPLACE FUNCTION public.auto_geocode_location()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = TG_RELID AND attname = 'geom' AND NOT attisdropped
  ) THEN
    NEW.geom := public.geom_from_latlng(NEW.latitude, NEW.longitude);
  END IF;
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.auto_geocode_location IS
  'DEPRECATED (WEB-BE-050): never geocoded; same behaviour as sync_geom_from_latlng. Safe to drop once no trigger outside this repo references it.';
