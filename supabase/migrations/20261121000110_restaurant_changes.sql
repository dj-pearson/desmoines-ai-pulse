-- WEB-BE-075: who last changed a restaurant row, and when its content last
-- changed.
--
-- There was no history on restaurants, and updated_at moves on every UPDATE
-- (update_restaurant_popularity, 20250728200000), including an hours re-check
-- that changed nothing a visitor reads. The page printed updated_at as
-- "Listing last updated" and fed it to dateModified, so a row looked freshly
-- reviewed after bookkeeping.
--
-- Additive only:
--   restaurant_changes        one row per UPDATE that changed something:
--                             changed columns, old and new values, actor, time.
--                             Admin-only read; written only by the trigger.
--   restaurants.content_changed_at
--                             moved only when a column a visitor reads changes
--                             (CONTENT_COLUMNS below, or the hours a visitor
--                             sees). Backfilled from updated_at.
--
-- ACTOR. 'person:<uid>' when a signed-in user made the change (admin edit,
-- owner via update_claimed_listing). For a service-role call: the request's
-- x-actor header when the caller sets one (bulk-update-restaurants does), else
-- 'service'. A direct SQL session reads 'sql'.
--
-- SIZE. Values are kept small: hours_json, geo_* and long text are stored as
-- {"changed": true} rather than their bodies; updated_at and
-- popularity_score are bookkeeping and never recorded.

CREATE TABLE IF NOT EXISTS public.restaurant_changes (
  id bigserial PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  columns text[] NOT NULL,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS restaurant_changes_restaurant_recent
  ON public.restaurant_changes (restaurant_id, changed_at DESC);

ALTER TABLE public.restaurant_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read restaurant changes" ON public.restaurant_changes;
CREATE POLICY "Admins read restaurant changes"
  ON public.restaurant_changes FOR SELECT
  TO authenticated
  USING (public.is_admin());

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS content_changed_at timestamptz;
UPDATE public.restaurants SET content_changed_at = updated_at WHERE content_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.restaurant_change_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_headers json;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;
  IF v_uid IS NOT NULL THEN
    RETURN 'person:' || v_uid::text;
  END IF;
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN 'sql';
  END IF;
  RETURN coalesce(left(nullif(btrim(v_headers ->> 'x-actor'), ''), 80), 'service');
END
$$;

-- Columns whose change means the listing's content changed for a visitor.
CREATE OR REPLACE FUNCTION public.restaurant_content_changed(o public.restaurants, n public.restaurants)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (to_jsonb(o) -> 'name') IS DISTINCT FROM (to_jsonb(n) -> 'name')
      OR (to_jsonb(o) -> 'description') IS DISTINCT FROM (to_jsonb(n) -> 'description')
      OR (to_jsonb(o) -> 'cuisine') IS DISTINCT FROM (to_jsonb(n) -> 'cuisine')
      OR (to_jsonb(o) -> 'location') IS DISTINCT FROM (to_jsonb(n) -> 'location')
      OR (to_jsonb(o) -> 'phone') IS DISTINCT FROM (to_jsonb(n) -> 'phone')
      OR (to_jsonb(o) -> 'website') IS DISTINCT FROM (to_jsonb(n) -> 'website')
      OR (to_jsonb(o) -> 'price_range') IS DISTINCT FROM (to_jsonb(n) -> 'price_range')
      OR (to_jsonb(o) -> 'menu_url') IS DISTINCT FROM (to_jsonb(n) -> 'menu_url')
      OR (to_jsonb(o) -> 'image_url') IS DISTINCT FROM (to_jsonb(n) -> 'image_url')
      OR (to_jsonb(o) -> 'status') IS DISTINCT FROM (to_jsonb(n) -> 'status')
      OR (to_jsonb(o) -> 'business_status') IS DISTINCT FROM (to_jsonb(n) -> 'business_status')
      -- The hours a visitor reads, not the fetch stamp the refresh rewrites.
      OR (to_jsonb(o) #> '{hours_json,weekdayDescriptions}') IS DISTINCT FROM (to_jsonb(n) #> '{hours_json,weekdayDescriptions}')
$$;

CREATE OR REPLACE FUNCTION public.restaurants_touch_content_changed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.restaurant_content_changed(OLD, NEW) THEN
    NEW.content_changed_at := now();
  ELSE
    NEW.content_changed_at := OLD.content_changed_at;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_restaurants_content_changed_at ON public.restaurants;
CREATE TRIGGER trg_restaurants_content_changed_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.restaurants_touch_content_changed_at();

CREATE OR REPLACE FUNCTION public.record_restaurant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
  k text;
  cols text[] := '{}';
  ov jsonb := '{}'::jsonb;
  nv jsonb := '{}'::jsonb;
  big constant text[] := ARRAY['hours_json', 'geo_summary', 'geo_key_facts', 'geo_faq', 'description', 'ai_writeup', 'seo_description'];
BEGIN
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    CONTINUE WHEN k IN ('updated_at', 'popularity_score', 'content_changed_at');
    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      cols := cols || k;
      IF k = ANY (big) OR length(coalesce((n -> k)::text, '')) > 300 OR length(coalesce((o -> k)::text, '')) > 300 THEN
        ov := ov || jsonb_build_object(k, jsonb_build_object('changed', true));
        nv := nv || jsonb_build_object(k, jsonb_build_object('changed', true));
      ELSE
        ov := ov || jsonb_build_object(k, o -> k);
        nv := nv || jsonb_build_object(k, n -> k);
      END IF;
    END IF;
  END LOOP;
  IF array_length(cols, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.restaurant_changes (restaurant_id, actor, columns, old_values, new_values)
  VALUES (NEW.id, public.restaurant_change_actor(), cols, ov, nv);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_record_restaurant_change ON public.restaurants;
CREATE TRIGGER trg_record_restaurant_change
  AFTER UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.record_restaurant_change();
