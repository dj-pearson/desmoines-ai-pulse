-- Drop the four location triggers from 20250731000002 (eat-drink pass 2, WP5.9).
--
-- WRITTEN, NOT APPLIED. Applying it is D-E2 in docs/page-plans/eat-drink-pass2.md.
--
-- What they do: BEFORE INSERT OR UPDATE OF location, public.update_coordinates()
-- makes a synchronous http_post to geocode-location from inside the write, and
-- assigns whatever comes back to NEW.latitude / NEW.longitude. When the call
-- fails or the function answers without a pair, both are assigned NULL, so an
-- address edit can erase coordinates a known-venue match set at ingest. The
-- URL is hardcoded to one project, so a fresh `supabase db reset` recreates a
-- trigger that calls production from a local database.
--
-- Nothing depends on them. Coordinates are set at ingest by
-- _shared/knownVenues.ts (firecrawl-scraper, ai-crawler), and
-- data-quality-heal-nightly backfills what the match refused. geom is kept in
-- sync by sync_geom_from_latlng (20260919000005), which is a different trigger
-- and is not touched here.
--
-- Backward compatibility: dropping a trigger changes no table, column, view or
-- RPC a client reads. public.update_coordinates() itself stays for one release
-- (CLAUDE.md deprecation flow) and can be dropped after that.

DO $$
BEGIN
  IF to_regclass('public.restaurants') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS on_restaurant_location_change ON public.restaurants;
  END IF;

  IF to_regclass('public.events') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS on_event_location_change ON public.events;
  END IF;

  IF to_regclass('public.attractions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS on_attraction_location_change ON public.attractions;
  END IF;

  IF to_regclass('public.playgrounds') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS on_playground_location_change ON public.playgrounds;
  END IF;
END $$;
