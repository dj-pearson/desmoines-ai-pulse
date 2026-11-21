-- WEB-BE-070: Google's rating, review count and price, with a date and a source.
--
-- The detail page showed the Google rating in four places with no date, the
-- admin Places tool fetched the review count and dropped it, and the page and
-- the FAQPage JSON-LD said "Google lists" a price_range that came from page
-- text, a model or a default (the enrichment mask had no priceLevel).
--
--   google_review_count       Places userRatingCount, from the stale refresh,
--                             the full enrichment and the admin Places tool.
--   google_rating_checked_at  when rating / google_review_count were last read
--                             from Google. Null on rows read before this.
--   price_range_source        'google' when Google's priceLevel supplied
--                             price_range. Null means not recorded, and the
--                             page then credits nobody.
--   price_range_source_at     stamped with every source write. The trigger
--                             below uses it to tell a write that claims a
--                             source from one that does not.
--
-- Additive per CLAUDE.md: nullable columns with no default (no rewrite), CHECKs
-- on brand-new columns (no existing row can fail them), one new trigger that
-- only ever writes price_range_source, and restaurant_lockable_fields gaining a
-- name. Older iOS/Android binaries ignore the new keys.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_rating_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_range_source text,
  ADD COLUMN IF NOT EXISTS price_range_source_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_google_review_count_nonneg
    CHECK (google_review_count IS NULL OR google_review_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_price_range_source_known
    CHECK (price_range_source IS NULL OR price_range_source IN ('google', 'admin', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.restaurants.google_review_count IS
  'WEB-BE-070: Google Places userRatingCount. Null = not read yet. Shown with rating and google_rating_checked_at.';
COMMENT ON COLUMN public.restaurants.google_rating_checked_at IS
  'WEB-BE-070: when rating and google_review_count were last read from Google Places.';
COMMENT ON COLUMN public.restaurants.price_range_source IS
  'WEB-BE-070: who supplied price_range. google = Places priceLevel. Null = not recorded; the page names no source.';
COMMENT ON COLUMN public.restaurants.price_range_source_at IS
  'WEB-BE-070: when price_range_source was last written. An update that changes price_range without moving this clears the source.';

-- A writer that changes price_range without claiming a source (an admin edit,
-- the AI crawler, the opening scraper) must not leave 'google' on a value
-- Google did not give. The Google writers stamp price_range_source_at on every
-- price write, so "the price changed and the stamp did not" means somebody
-- else wrote it.
CREATE OR REPLACE FUNCTION public.restaurants_price_source_follows_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.price_range IS DISTINCT FROM OLD.price_range
     AND NEW.price_range_source_at IS NOT DISTINCT FROM OLD.price_range_source_at THEN
    NEW.price_range_source := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restaurants_price_source_follows_price ON public.restaurants;
CREATE TRIGGER restaurants_price_source_follows_price
  BEFORE UPDATE OF price_range ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.restaurants_price_source_follows_price();

-- price_range is now written by Google on every refresh, so an admin's price
-- needs the same protection as their phone or website (WEB-BE-069). Same
-- function, one more name; set_restaurant_field_locks and
-- update_claimed_listing read it and are unchanged.
CREATE OR REPLACE FUNCTION public.restaurant_lockable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['description', 'website', 'phone', 'image_url', 'menu_url', 'cuisine', 'location', 'rating', 'price_range']::text[];
$$;

GRANT EXECUTE ON FUNCTION public.restaurant_lockable_fields() TO anon, authenticated;
