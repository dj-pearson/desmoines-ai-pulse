-- WEB-BE-044: Places photo provenance, and a repair for the broken image_url
-- values bulk-update-restaurants has been writing.
--
-- WHAT WAS THERE. bulk-update-restaurants set
--   image_url = 'https://places.googleapis.com/v1/<photo>/media?maxWidthPx=1200&maxHeightPx=800'
-- under a comment claiming it stored "the photo reference name instead of the
-- full URL with API key". It is a full media URL with the key omitted, so it
-- returns 403 and those rows render a broken image. Hot-linking Places media
-- out of a content column is also outside the Maps Platform terms even when it
-- works, and nothing carried the attribution Places requires.
--
-- WHY THE RESOURCE NAME IS SAFE TO KEEP AND THE BYTES ARE NOT. The terms allow
-- caching Place content for at most 30 days; place IDs are exempt. A photo
-- resource name is a reference, like a place ID - it identifies the photo
-- without being the photo - so it can live on the row, and anything that wants
-- pixels builds the media URL at fetch time. seen_at is what makes the 30-day
-- rule checkable: _shared/placesPhoto.ts treats a copy with no timestamp as
-- expired, which is every row written before this migration.
--
-- Additive per CLAUDE.md: three nullable columns, no default, no rewrite. The
-- writer guards against this migration not being applied yet through the
-- existing unknown-column retry (WEB-FEAT-024), so either deploy order is safe.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS places_photo_name TEXT,
  ADD COLUMN IF NOT EXISTS places_photo_attribution TEXT,
  ADD COLUMN IF NOT EXISTS places_photo_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.restaurants.places_photo_name IS
  'Google Places photo RESOURCE NAME ("places/<id>/photos/<ref>") - a reference, not Place content, so it may be stored indefinitely. Never a media URL (WEB-BE-044).';
COMMENT ON COLUMN public.restaurants.places_photo_attribution IS
  'Author attribution Places requires wherever the photo is shown (WEB-BE-044).';
COMMENT ON COLUMN public.restaurants.places_photo_seen_at IS
  'When the photo reference was last seen in a Places response. A copy of the BYTES may not outlive this by more than 30 days; a NULL reads as expired (WEB-BE-044).';

-- ---------------------------------------------------------------------------
-- The repair. Every one of these image_url values is a 403 today, so nulling
-- them costs no working image and stops the restaurant card rendering a broken
-- one. The photo reference inside the URL is salvaged into the new column
-- rather than discarded, so a future refresh has something to work from.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  broken integer;
  salvaged integer;
BEGIN
  SELECT count(*) INTO broken
  FROM public.restaurants
  WHERE image_url LIKE 'https://places.googleapis.com/v1/%/media%';

  WITH repaired AS (
    UPDATE public.restaurants
    SET
      -- regexp_replace, not substring with a greedy pattern: a photo reference
      -- contains slashes, so anchoring on both ends is what keeps it whole.
      places_photo_name = COALESCE(
        places_photo_name,
        regexp_replace(
          split_part(image_url, '?', 1),
          '^https://places\.googleapis\.com/v1/(.+)/media$',
          '\1'
        )
      ),
      image_url = NULL
    WHERE image_url LIKE 'https://places.googleapis.com/v1/%/media%'
    RETURNING places_photo_name
  )
  SELECT count(*) FILTER (WHERE places_photo_name IS NOT NULL) INTO salvaged FROM repaired;

  -- seen_at is deliberately left NULL on these rows. The reference is old and
  -- unverified; marking it fresh here would be inventing a fact.
  RAISE NOTICE 'WEB-BE-044 repair: % restaurant(s) had a Places media URL in image_url; % photo reference(s) salvaged.',
    broken, salvaged;
END
$do$;

-- NO CHECK CONSTRAINT, and I wrote one before deleting it. The argument for it
-- looked good: it rejects a shape no correct writer produces, the repair above
-- leaves no row violating it, and the one writer that produced it is fixed in
-- the same release. The argument is wrong for the same reason it was wrong for
-- WEB-BE-049's categories - edge functions deploy separately from migrations
-- (CLAUDE.md, Backward Compatibility). If this lands before
-- bulk-update-restaurants redeploys, the OLD function's UPDATE fails with
-- 23514 for every restaurant that has a photo, and the unknown-column retry
-- above cannot help because a constraint violation is not an unknown column.
--
-- It belongs in a later release. Until then the rule is enforced where it can
-- be enforced safely: in the writer (which deletes the field) and in
-- scripts/check-places-media.mjs, which fails the build if any source file puts
-- a Places media URL into a content column.
