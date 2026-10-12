-- Hotels get the Places photo provenance restaurants got in 20260919000004,
-- plus the two columns a Storage copy of the bytes needs to stay inside the
-- 30-day rule.
--
-- WHAT WAS THERE (measured 2026-10-11 on the live DB). 63 rows in
-- public.hotels, all active, and not one with google_place_id, image_url or
-- gallery_urls. Every hotel card renders the building icon.
--
-- THE FIRST THREE COLUMNS mean exactly what they mean on restaurants:
--   places_photo_name         the photo RESOURCE NAME ("places/<id>/photos/<ref>"),
--                             a reference and never a media URL
--   places_photo_attribution  the author attribution Places requires wherever
--                             the photo is shown
--   places_photo_seen_at      when that reference was last seen in a Places
--                             response; NULL reads as expired
--
-- THE TWO NEW ONES exist because hotels, unlike restaurants, do keep the bytes:
-- backfill-images copies the photo into Storage so the card has a displayable
-- image, and that copy is Place content, cacheable for at most 30 days.
--   places_photo_cached_at    when the bytes now in Storage were fetched. The
--                             copy is replaced before it is 30 days old and
--                             deleted if it cannot be replaced.
--   places_photo_cached_path  the Storage key of that copy, so it can be
--                             deleted. No media_assets row is written for it:
--                             media_assets is the dedup index, and a later
--                             byte-identical image elsewhere would otherwise
--                             share a file this job deletes within a month.
--
-- image_checked_at is the column every other table backfill-images processes
-- already has (20260620000008): the stamp that keeps a row with no findable
-- image out of the working set for the retry window.
--
-- Additive per CLAUDE.md: nullable, no default, no rewrite, no constraint.
-- enrich-hotels-places retries without the places_photo_* columns on 42703, and
-- useHotels retries its list select without them, so either deploy order is
-- safe. backfill-images' "hotels" category needs this migration and fails that
-- category alone (500, other categories untouched) until it is applied.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS places_photo_name TEXT,
  ADD COLUMN IF NOT EXISTS places_photo_attribution TEXT,
  ADD COLUMN IF NOT EXISTS places_photo_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS places_photo_cached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS places_photo_cached_path TEXT,
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hotels.places_photo_name IS
  'Google Places photo RESOURCE NAME ("places/<id>/photos/<ref>") - a reference, not Place content. Never a media URL (WEB-BE-044). Refreshed from Place Details before each copy, because Google says a photo name can expire.';
COMMENT ON COLUMN public.hotels.places_photo_attribution IS
  'Author attribution Places requires wherever the photo is shown (WEB-BE-044).';
COMMENT ON COLUMN public.hotels.places_photo_seen_at IS
  'When the photo reference was last seen in a Places response. A NULL reads as expired (WEB-BE-044).';
COMMENT ON COLUMN public.hotels.places_photo_cached_at IS
  'When the Places photo BYTES now in Storage (places_photo_cached_path, shown via image_url) were fetched. backfill-images replaces the copy before 30 days and deletes it if it cannot; NULL means image_url is not a Places copy.';
COMMENT ON COLUMN public.hotels.places_photo_cached_path IS
  'Storage key (bucket "media") of the Places photo copy, so the 30-day expiry can delete it. Deliberately not in media_assets.';
COMMENT ON COLUMN public.hotels.image_checked_at IS
  'Last time backfill-images attempted to find an image for this row (success or fail). Drives the retry window, as on events/restaurants/attractions/playgrounds.';

-- The expiry sweep reads this on every hotels run.
CREATE INDEX IF NOT EXISTS idx_hotels_places_photo_cached_at
  ON public.hotels (places_photo_cached_at)
  WHERE places_photo_cached_at IS NOT NULL;
