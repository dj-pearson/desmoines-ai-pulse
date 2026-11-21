-- WEB-BE-077: say where restaurant copy came from and when AI copy was made.
--
-- About printed restaurants.description with no source, though it may be
-- Google's editorial summary, scraped text or model output; the Local Guide
-- and AI answers (geo_*) were badged AI-assisted but undated.
--
-- Additive only:
--   restaurants.description_source  'google' | 'restaurant' | 'editor' | 'ai' | NULL (unknown)
--   restaurants.geo_generated_at    when geo_summary / geo_key_facts / geo_faq last changed
--
-- Both are kept by one BEFORE UPDATE trigger, so no writer has to remember:
--   description changes and the statement did not set description_source:
--     x-actor 'bulk-update-restaurants'  -> 'google' (it writes Google's editorial summary)
--     x-actor 'enhance-content'          -> 'ai'
--     a signed-in user with a verified claim on the row -> 'restaurant'
--     any other signed-in user (admin)   -> 'editor'
--     anything else                      -> NULL (unknown, and labelled as nothing)
--   any geo_* column changes -> geo_generated_at = now()
-- Existing rows keep NULL for both: the source and the date were never
-- recorded, and guessing would put a false label on the page.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS description_source text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS geo_generated_at timestamptz;

CREATE OR REPLACE FUNCTION public.restaurants_track_copy_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_actor text;
  v_headers json;
BEGIN
  IF (to_jsonb(NEW) -> 'description') IS DISTINCT FROM (to_jsonb(OLD) -> 'description')
     AND NEW.description_source IS NOT DISTINCT FROM OLD.description_source THEN
    BEGIN
      v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;
    IF v_uid IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.business_claims c
         WHERE c.listing_type = 'restaurant' AND c.listing_id = NEW.id
           AND c.user_id = v_uid AND c.status = 'verified'
      ) THEN
        NEW.description_source := 'restaurant';
      ELSE
        NEW.description_source := 'editor';
      END IF;
    ELSE
      BEGIN
        v_headers := current_setting('request.headers', true)::json;
      EXCEPTION WHEN OTHERS THEN
        v_headers := NULL;
      END;
      v_actor := v_headers ->> 'x-actor';
      NEW.description_source := CASE v_actor
        WHEN 'bulk-update-restaurants' THEN 'google'
        WHEN 'enhance-content' THEN 'ai'
        ELSE NULL
      END;
    END IF;
  END IF;

  IF (to_jsonb(NEW) -> 'geo_summary') IS DISTINCT FROM (to_jsonb(OLD) -> 'geo_summary')
     OR (to_jsonb(NEW) -> 'geo_key_facts') IS DISTINCT FROM (to_jsonb(OLD) -> 'geo_key_facts')
     OR (to_jsonb(NEW) -> 'geo_faq') IS DISTINCT FROM (to_jsonb(OLD) -> 'geo_faq') THEN
    NEW.geo_generated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_restaurants_copy_provenance ON public.restaurants;
CREATE TRIGGER trg_restaurants_copy_provenance
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.restaurants_track_copy_provenance();
