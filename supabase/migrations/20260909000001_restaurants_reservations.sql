-- WEB-FEAT-024: restaurant pages could only tell a visitor to phone ahead.
--
-- The only booking affordance on a restaurant page was a tel: link
-- ("Call to Reserve", RestaurantDetails.tsx). No OpenTable, Resy, Tock or Yelp
-- link existed anywhere in src/. Booking a table is the highest-intent action
-- on the page and it had no path.
--
-- WHAT GOOGLE ACTUALLY GIVES US, checked against the Places API (New)
-- reference rather than assumed. `reservable` (boolean) and `googleMapsUri`
-- (string) are real fields on Place. A booking-provider URL is NOT: there is no
-- reservationUrl, no OpenTable link, nothing of the sort. The story's own
-- acceptance criteria claimed "provider URLs" come from Places; that half was
-- wrong and this migration is shaped around what exists.
--
-- So there are two sources, and the columns keep them apart:
--
--   reservable, google_maps_uri  -- AUTOMATIC, from the enrichment pass. Google
--                                   listings carry their own reserve button for
--                                   reservable places, so this is a working
--                                   booking path with zero curation.
--   reservation_url, provider    -- CURATED. Better when present, because it
--                                   goes straight to the restaurant's own
--                                   booking page. Null until someone fills it.
--
-- Additive per CLAUDE.md: ADD COLUMN ... NULL, no defaults, no rewrite. Older
-- iOS/Android binaries ignore keys they do not read. The detail page selects
-- `*`, so these appear without any client change and their absence before the
-- migration lands cannot fail a query.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS reservable BOOLEAN,
  ADD COLUMN IF NOT EXISTS google_maps_uri TEXT,
  ADD COLUMN IF NOT EXISTS reservation_url TEXT,
  ADD COLUMN IF NOT EXISTS reservation_provider TEXT;

COMMENT ON COLUMN public.restaurants.reservable IS
  'Google Places `reservable` (WEB-FEAT-024). true = takes reservations, '
  'false = does not, NULL = unknown. NULL must not be rendered as "no".';
COMMENT ON COLUMN public.restaurants.google_maps_uri IS
  'Google Places `googleMapsUri` (WEB-FEAT-024). The Google listing, which '
  'carries its own reserve button for reservable places. Automatic fallback '
  'when no curated reservation_url exists.';
COMMENT ON COLUMN public.restaurants.reservation_url IS
  'Curated direct booking URL (WEB-FEAT-024). Preferred over google_maps_uri. '
  'No automatic source exists - the Places API publishes no booking link.';
COMMENT ON COLUMN public.restaurants.reservation_provider IS
  'Which platform reservation_url points at, for labelling the button.';

-- A CHECK on a brand-new nullable column is safe: no existing row has a value,
-- so nothing can fail validation. This is not the "tightening a CHECK" case the
-- backward-compatibility rules forbid.
DO $$ BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_reservation_provider_known
    CHECK (
      reservation_provider IS NULL
      OR reservation_provider IN ('opentable', 'resy', 'tock', 'yelp', 'sevenrooms', 'direct')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial index: the only query that will ever use these asks for the
-- restaurants that HAVE a booking path, which is a minority of rows.
CREATE INDEX IF NOT EXISTS idx_restaurants_reservable
  ON public.restaurants (reservable)
  WHERE reservable IS TRUE;
