-- WEB-BE-040: twenty percent of scraped rows were marked featured by
-- Math.random() in seven places (ai-crawler, firecrawl-scraper x4,
-- scrape-events x2). The homepage featured rail filters is_featured = true and
-- advanced search exposes it, so "featured" meant "won a coin toss at ingest"
-- and diluted every editorial or paid placement.
--
-- The writers are fixed in the same commit (every ingest site now inserts
-- is_featured: false, pinned by supabase/functions/_tests/featured-flag-
-- invariant.test.ts). This file cleans up what they already wrote.
--
-- WHAT IS CLEARED, per table, and why the rule differs:
--   events       source IS NOT NULL (ai-crawler) or source_url IS NOT NULL
--                (scrape-events, firecrawl). An admin-entered event may carry
--                a website in source_url too; there is no admin audit entry to
--                tell them apart (admin_action_logs has no writer), so those
--                lose the flag as well and an admin re-features what they
--                mean. Sponsored rows are exempt.
--   playgrounds  source IS NOT NULL AND manually_curated IS NOT TRUE. The one
--                content table with an explicit curation marker.
--   restaurants  every is_featured = true row that is not sponsored. No admin
--                surface writes restaurants.is_featured (HotelManager,
--                AttractionManager and DealManager do; nothing for
--                restaurants), so every true there came from firecrawl's coin
--                toss. The hub rail already unions rating >= 4.0, so the
--                homepage does not empty.
--   attractions  NOT cleared. AttractionManager has a bulk "feature" action
--                and the rows carry no origin marker, so scraper output and
--                editorial choice are indistinguishable. Counted in the
--                NOTICE for the owner to review by hand.
--
-- DRY RUN FIRST: scripts/audit-random-featured.mjs prints the same counts
-- through PostgREST with the anon key and touches nothing. This block also
-- RAISEs the counts it is about to change immediately before each UPDATE.
--
-- Additive-safe: a boolean flip on a column that keeps its shape. No client
-- reads is_featured as anything but a hint.

DO $$
DECLARE
  n_events integer;
  n_playgrounds integer;
  n_restaurants integer;
  n_attractions integer;
  u_events integer := 0;
  u_playgrounds integer := 0;
  u_restaurants integer := 0;
BEGIN
  -- Dry-run counts, in the log before anything changes.
  SELECT count(*) INTO n_events
    FROM public.events e
   WHERE e.is_featured = true
     AND e.is_sponsored IS NOT TRUE
     AND (e.source IS NOT NULL OR e.source_url IS NOT NULL)
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l
            WHERE l.listing_type = 'event' AND l.listing_id = e.id
         );

  SELECT count(*) INTO n_playgrounds
    FROM public.playgrounds p
   WHERE p.is_featured = true
     AND p.source IS NOT NULL
     AND p.manually_curated IS NOT TRUE;

  SELECT count(*) INTO n_restaurants
    FROM public.restaurants r
   WHERE r.is_featured = true
     AND r.is_sponsored IS NOT TRUE
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l
            WHERE l.listing_type = 'restaurant' AND l.listing_id = r.id
         );

  SELECT count(*) INTO n_attractions
    FROM public.attractions a
   WHERE a.is_featured = true;

  RAISE NOTICE 'WEB-BE-040 dry run: events %, playgrounds %, restaurants % will be cleared; attractions % left for review',
    n_events, n_playgrounds, n_restaurants, n_attractions;

  UPDATE public.events e
     SET is_featured = false
   WHERE e.is_featured = true
     AND e.is_sponsored IS NOT TRUE
     AND (e.source IS NOT NULL OR e.source_url IS NOT NULL)
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l
            WHERE l.listing_type = 'event' AND l.listing_id = e.id
         );
  GET DIAGNOSTICS u_events = ROW_COUNT;

  UPDATE public.playgrounds p
     SET is_featured = false
   WHERE p.is_featured = true
     AND p.source IS NOT NULL
     AND p.manually_curated IS NOT TRUE;
  GET DIAGNOSTICS u_playgrounds = ROW_COUNT;

  UPDATE public.restaurants r
     SET is_featured = false
   WHERE r.is_featured = true
     AND r.is_sponsored IS NOT TRUE
     AND NOT EXISTS (
           SELECT 1 FROM public.sponsored_listing_links l
            WHERE l.listing_type = 'restaurant' AND l.listing_id = r.id
         );
  GET DIAGNOSTICS u_restaurants = ROW_COUNT;

  RAISE NOTICE 'WEB-BE-040 applied: events %, playgrounds %, restaurants % cleared',
    u_events, u_playgrounds, u_restaurants;
END $$;
