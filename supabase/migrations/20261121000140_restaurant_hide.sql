-- WEB-FEAT-103: an admin hides a restaurant instead of deleting it, and a
-- hidden place stays out of every ingestion path.
--
-- WHAT WAS WRONG. The admin Delete button ran a row DELETE
-- (AdminContent.tsx handleDelete). The URL started answering 404 with no
-- redirect, nothing recorded who removed it or why, and the next Places search
-- or scrape could add the place straight back.
--
-- WHAT THIS ADDS
--   restaurants.hidden_at / hidden_by / hidden_reason
--       Set by hide_restaurant, cleared by unhide_restaurant. The row and its
--       history stay. restaurant_changes records the hide like any other
--       update (WEB-BE-075).
--   "Hidden restaurants are admin-only"
--       A RESTRICTIVE select policy: anyone but an admin reads a hidden row as
--       absent. That is what a DELETE did to every reader (web lists, the
--       rotation RPC, the iOS and Android apps, the build-time sitemap, the
--       edge shell), so no client sees anything a delete did not already show
--       it. Existing rows all have hidden_at NULL, so no read that works today
--       stops working when this is applied.
--   get_removed_restaurant(p_ref)
--       The one thing a visitor may still learn about a hidden row: its name,
--       so the detail page and the edge shell can say "this listing was
--       removed" at 200 instead of a 404.
--   restaurant_blacklist.restaurant_id and reason_category 'admin_hidden'
--       hide_restaurant writes the place id and name to the existing
--       do-not-ingest list (20260127000000), tagged with the row it came from
--       so unhide_restaurant removes exactly that entry. Every ingestion path
--       reads the list through supabase/functions/_shared/restaurantDoNotIngest.ts;
--       restaurant-do-not-ingest.test.ts asserts each one does.
--   restaurant_lockable_fields()
--       Gains status, business_status, hours_json, opening, google_place_id
--       and reservation_url, the fields the admin drawer edits, so an admin's
--       edit of them is a person's edit under WEB-BE-069 and Google enrichment
--       leaves it alone.
--   fuzzy_search_restaurants
--       Same signature and columns; leaves hidden rows out. It is SECURITY
--       DEFINER, so the policy above does not reach it.
--
-- BACKWARD COMPATIBILITY. Additive: three nullable columns with no default,
-- one nullable column on restaurant_blacklist, a CHECK widened by one value
-- (old writers' values all still pass), new functions, and two CREATE OR
-- REPLACE with unchanged signatures and return shapes. The new policy hides
-- only rows an admin hides from now on, and a hidden row reads exactly as a
-- deleted one did.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hidden_by uuid;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS hidden_reason text;

COMMENT ON COLUMN public.restaurants.hidden_at IS
  'WEB-FEAT-103: when an admin hid this listing. Non-admins read a hidden row as absent (RLS); the detail page says it was removed.';

ALTER TABLE public.restaurant_blacklist ADD COLUMN IF NOT EXISTS restaurant_id uuid;

COMMENT ON COLUMN public.restaurant_blacklist.restaurant_id IS
  'WEB-FEAT-103: the restaurants row an admin_hidden entry was written for, so unhide removes that entry and no other.';

ALTER TABLE public.restaurant_blacklist DROP CONSTRAINT IF EXISTS restaurant_blacklist_reason_category_check;
ALTER TABLE public.restaurant_blacklist ADD CONSTRAINT restaurant_blacklist_reason_category_check
  CHECK (reason_category IN (
    'not_restaurant', 'chain', 'duplicate', 'out_of_scope', 'closed_permanent',
    'spam', 'added_to_db', 'other', 'admin_hidden'
  ));

CREATE INDEX IF NOT EXISTS idx_blacklist_restaurant_id
  ON public.restaurant_blacklist (restaurant_id)
  WHERE restaurant_id IS NOT NULL;

-- The RESTRICTIVE select policy that hides a hidden row from visitors is in
-- 20261121000990_restaurants_hidden_rls.sql, sorted last on purpose: it
-- refuses to apply when RLS is off on restaurants, and a refusal there must
-- not block the rest of this release's migrations.

-- Same list as 20261121000130 (which added price_range) plus the fields the
-- admin drawer edits. scripts/__tests__/lockable-fields-never-shrink.test.mjs
-- fails if a later definition drops one.
-- bulk-update-restaurants drops every locked key from its writes
-- (_shared/restaurantFieldLocks.ts keeps no list of its own).
CREATE OR REPLACE FUNCTION public.restaurant_lockable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'description', 'website', 'phone', 'image_url', 'menu_url', 'cuisine', 'location', 'rating',
    'price_range',
    'status', 'business_status', 'hours_json', 'opening', 'google_place_id', 'reservation_url'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.hide_restaurant(
  p_restaurant_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.restaurants%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'hide_restaurant: admins only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hide_restaurant: no restaurant %', p_restaurant_id USING ERRCODE = '22023';
  END IF;

  IF v_row.hidden_at IS NULL THEN
    UPDATE public.restaurants
       SET hidden_at = now(),
           hidden_by = auth.uid(),
           hidden_reason = v_reason
     WHERE id = p_restaurant_id
    RETURNING * INTO v_row;
  END IF;

  -- One entry per hidden row. A second hide (or a hide after an entry was
  -- written by hand) does not stack duplicates.
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_blacklist
     WHERE restaurant_id = p_restaurant_id AND reason_category = 'admin_hidden'
  ) THEN
    INSERT INTO public.restaurant_blacklist
      (google_place_id, restaurant_name, reason, reason_category, formatted_address, blocked_by, restaurant_id)
    VALUES
      (v_row.google_place_id, v_row.name, coalesce(v_reason, 'Hidden by an admin'), 'admin_hidden',
       v_row.location, auth.uid(), p_restaurant_id);
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'hidden_at', v_row.hidden_at,
    'blocked_place_id', v_row.google_place_id,
    'blocked_name', v_row.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hide_restaurant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_restaurant(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.hide_restaurant(uuid, text) IS
  'WEB-FEAT-103: admins hide a restaurant (the row is kept) and put its place id and name on restaurant_blacklist, which every ingestion path checks.';

CREATE OR REPLACE FUNCTION public.unhide_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'unhide_restaurant: admins only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.restaurants
     SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
   WHERE id = p_restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unhide_restaurant: no restaurant %', p_restaurant_id USING ERRCODE = '22023';
  END IF;

  -- Only the entry the hide wrote. A block an admin added by hand in the
  -- Places tools (another category, no restaurant_id) stays.
  DELETE FROM public.restaurant_blacklist
   WHERE restaurant_id = p_restaurant_id AND reason_category = 'admin_hidden';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unhide_restaurant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unhide_restaurant(uuid) TO authenticated;

-- The name and slug of a hidden restaurant, and nothing else, by slug or id.
-- Both were public until the moment it was hidden. Empty for a row that is
-- not hidden or does not exist, so this cannot be used to read live rows
-- around the policy.
CREATE OR REPLACE FUNCTION public.get_removed_restaurant(p_ref text)
RETURNS TABLE (id uuid, name text, slug text, hidden_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.name, r.slug, r.hidden_at
    FROM public.restaurants r
   WHERE r.hidden_at IS NOT NULL
     AND (r.slug = p_ref OR r.id::text = lower(p_ref))
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_removed_restaurant(text) TO anon, authenticated;

-- 20261008000001 with one predicate added: r.hidden_at IS NULL.
CREATE OR REPLACE FUNCTION public.fuzzy_search_restaurants(search_query text, search_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, description text, cuisine text, location text, latitude real, longitude real, phone text, website text, rating numeric, price_range text, image_url text, city text, relevance_score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pattern text := '%' || replace(replace(replace(coalesce(search_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit integer := LEAST(GREATEST(COALESCE(search_limit, 50), 0), 50);
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.description,
    r.cuisine,
    r.location,
    r.latitude,
    r.longitude,
    r.phone,
    r.website,
    r.rating,
    r.price_range,
    r.image_url,
    r.city,
    GREATEST(
      similarity(r.name, search_query),
      similarity(COALESCE(r.description, ''), search_query),
      similarity(COALESCE(r.cuisine, ''), search_query),
      similarity(COALESCE(r.location, ''), search_query)
    )::REAL as relevance_score
  FROM public.restaurants r
  WHERE
    r.is_merged IS NOT TRUE
    AND r.hidden_at IS NULL
    AND (
      r.name ILIKE v_pattern
      OR COALESCE(r.description, '') ILIKE v_pattern
      OR COALESCE(r.cuisine, '') ILIKE v_pattern
      OR COALESCE(r.location, '') ILIKE v_pattern
    )
  ORDER BY relevance_score DESC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fuzzy_search_restaurants(text, integer) TO anon, authenticated, service_role;
