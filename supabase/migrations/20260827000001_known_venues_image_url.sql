-- Default hero image per venue.
--
-- WHY. Every ingest path downloads a per-event image and stores it: an SSRF
-- check, a fetch, a dimension check, a sha256, a storage upload and a
-- media_assets row, for each event. For an AGGREGATOR (Catch Des Moines,
-- SeatGeek, Eventbrite) that is worth it, because each event genuinely has its
-- own artwork. For a SINGLE-VENUE source it is not: Hoyt Sherman, Wooly's,
-- Vibrant Music Hall and the Wells Fargo Arena teams publish the same venue or
-- team art over and over, so the pipeline spends egress downloading near-
-- duplicates and storage keeping the ones that differ by a byte.
--
-- One image per venue, stored once, referenced by every event at that venue.
--
-- KEYED BY VENUE, NOT BY SOURCE, which is the decision behind putting this
-- column here rather than in eventSourceProfiles.ts: Iowa Barnstormers, Iowa
-- Wild and Iowa Wolves are three sources at ONE venue, and they share this row.
--
-- ADD COLUMN ... NULL with no default, which CLAUDE.md lists as always safe in a
-- single release: no table rewrite, and every existing reader is unaffected
-- because nothing selects a column it does not know about. Null means "no venue
-- default" and the per-event path is used, so this is inert until someone fills
-- it in.

ALTER TABLE public.known_venues
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.known_venues.image_url IS
  'Default hero image for events at this venue. Set for single-venue sources so the scrapers do not fetch and store a near-duplicate image per event. NULL means fall back to the per-event image. See supabase/functions/_shared/venueImage.ts.';

-- Partial index: the only question asked of this column is "which venues have
-- one", by the backfill and by the ingest cache warm-up.
CREATE INDEX IF NOT EXISTS known_venues_image_url_present_idx
  ON public.known_venues (name)
  WHERE image_url IS NOT NULL;

-- AFTER APPLYING THIS, run both of these or CI stays wrong in two directions:
--
--   supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   node scripts/check-schema-usage.mjs --update
--
-- Until then, schema-baseline.json carries two entries for known_venues.image_url
--   column|scripts/reclaim-venue-images.ts|known_venues.image_url
--   column|supabase/functions/_shared/venueImage.ts|known_venues.image_url
-- which are ACCURATE, not suppressed noise: the column does not exist yet, so
-- those reads really would 42703. venueImage.ts handles that - it logs and falls
-- back to the per-event image - so the code is safe to deploy before the
-- migration lands. The two entries disappear on the --update above.
