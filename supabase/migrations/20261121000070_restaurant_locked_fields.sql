-- WEB-BE-069: a correction a person makes to a restaurant listing survives the
-- next Google enrichment.
--
-- Three writers shared the same columns with no precedence. Owners edit
-- description, website, phone, image_url and menu_url through
-- update_claimed_listing; admins edit those and cuisine, location and rating
-- in ContentEditDialog; bulk-update-restaurants then overwrote cuisine,
-- location, rating, description, phone and website from Google on its next
-- pass, and "Clear Enhanced Status" queues every row for that pass.
--
-- restaurants.locked_fields records which fields a person set:
--   { "phone": { "by": "owner", "at": "2026-11-21T15:04:05Z" }, ... }
-- "by" is 'owner' or 'admin'. No user id is stored: restaurants is publicly
-- readable, and an owner's account id has no business in a public row.
-- bulk-update-restaurants drops every key in this map from its writes, in the
-- full enrichment and in the hours refresh modes
-- (supabase/functions/_shared/restaurantFieldLocks.ts).
--
-- Writers of the map:
--   update_claimed_listing      redefined below with the same signature and
--                               behaviour; a restaurant edit also locks each
--                               field it set.
--   set_restaurant_field_locks  admins only. Locks the lockable fields an
--                               admin edit changed, and clears locks so
--                               Google's value comes back on the next run.
--
-- Additive only: a nullable column with no default (no table rewrite), one new
-- function, and update_claimed_listing keeping its arguments, return type,
-- field lists and errors. Null and {} both mean "nothing locked", so rows
-- written before this migration behave exactly as they did. The mobile apps
-- do not read or write any of it.

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS locked_fields jsonb;

COMMENT ON COLUMN public.restaurants.locked_fields IS
  'WEB-BE-069: fields a person set, as {field: {by: owner|admin, at}}. bulk-update-restaurants never overwrites these. Null or {} means nothing is locked.';

-- The fields a lock can name: everything an owner or an admin edits that the
-- Google enrichment also writes. menu_url is owner-edited and not written by
-- enrichment today; it is here so a later writer cannot overwrite it either.
CREATE OR REPLACE FUNCTION public.restaurant_lockable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['description', 'website', 'phone', 'image_url', 'menu_url', 'cuisine', 'location', 'rating']::text[];
$$;

GRANT EXECUTE ON FUNCTION public.restaurant_lockable_fields() TO anon, authenticated;

-- Same signature, checks, field lists and errors as 20260920000005. The only
-- change: a restaurant edit also writes a lock for each field it set.
CREATE OR REPLACE FUNCTION public.update_claimed_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowed text[];
  v_key text;
  v_sets text[] := '{}';
  v_table text;
  v_locks jsonb := '{}'::jsonb;
  v_lock jsonb := jsonb_build_object('by', 'owner', 'at', to_jsonb(now()));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'update_claimed_listing: sign in first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_claims
     WHERE listing_type = p_listing_type
       AND listing_id = p_listing_id
       AND user_id = v_user
       AND status = 'verified'
  ) THEN
    RAISE EXCEPTION 'update_claimed_listing: you have not verified this listing';
  END IF;

  IF p_listing_type = 'restaurant' THEN
    v_table := 'public.restaurants';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url', 'menu_url'];
  ELSIF p_listing_type = 'attraction' THEN
    v_table := 'public.attractions';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url'];
  ELSIF p_listing_type = 'venue' THEN
    v_table := 'public.known_venues';
    v_allowed := ARRAY['website', 'phone'];
  ELSE
    RAISE EXCEPTION 'update_claimed_listing: % is not a listing type', p_listing_type;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    -- REFUSE rather than ignore. Silently dropping a field an owner filled in
    -- is how somebody spends ten minutes correcting their hours and never finds
    -- out the form threw them away.
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'update_claimed_listing: % is not an owner-editable field on a %', v_key, p_listing_type;
    END IF;
    -- quote_ident on the key, and the VALUE goes through a parameter below.
    v_sets := v_sets || format('%I = ($1 ->> %L)', v_key, v_key);
    IF v_key = ANY(public.restaurant_lockable_fields()) THEN
      v_locks := v_locks || jsonb_build_object(v_key, v_lock);
    END IF;
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN false;
  END IF;

  -- WEB-BE-069. Only restaurants carry locked_fields; attractions and venues
  -- have no enrichment that overwrites owner edits.
  IF p_listing_type = 'restaurant' AND v_locks <> '{}'::jsonb THEN
    v_sets := v_sets || 'locked_fields = coalesce(locked_fields, ''{}''::jsonb) || $3'::text;
  END IF;

  EXECUTE format(
    'UPDATE %s SET %s, updated_at = now() WHERE id = $2',
    v_table,
    array_to_string(v_sets, ', ')
  ) USING p_patch, p_listing_id, v_locks;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) IS
  'Owner edits to a claimed listing, restricted to a fixed column list (WEB-ADS-009 AC4). A restaurant edit also locks each field it set against Google enrichment (WEB-BE-069). No UPDATE policy on the listing tables grants this - RLS cannot restrict columns.';

-- Admins only. p_lock: fields an admin edit changed; names outside
-- restaurant_lockable_fields() are ignored (name, status, price_range and so on
-- are never written by enrichment, so there is nothing to protect them from).
-- p_unlock: locks to clear, any name, so a lock written by an older list can
-- still be removed. Unlock is applied after lock. Returns the resulting map,
-- or null when there is no such restaurant.
CREATE OR REPLACE FUNCTION public.set_restaurant_field_locks(
  p_restaurant_id uuid,
  p_lock text[] DEFAULT '{}',
  p_unlock text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_add jsonb := '{}'::jsonb;
  v_key text;
  v_result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'set_restaurant_field_locks: admins only' USING ERRCODE = '42501';
  END IF;

  FOREACH v_key IN ARRAY coalesce(p_lock, '{}'::text[]) LOOP
    IF v_key = ANY(public.restaurant_lockable_fields()) THEN
      v_add := v_add || jsonb_build_object(v_key, jsonb_build_object('by', 'admin', 'at', to_jsonb(now())));
    END IF;
  END LOOP;

  -- This does not set updated_at itself: a lock is bookkeeping, not a content
  -- change.
  UPDATE public.restaurants
     SET locked_fields = nullif((coalesce(locked_fields, '{}'::jsonb) || v_add) - coalesce(p_unlock, '{}'::text[]), '{}'::jsonb)
   WHERE id = p_restaurant_id
  RETURNING coalesce(locked_fields, '{}'::jsonb) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_restaurant_field_locks(uuid, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_restaurant_field_locks(uuid, text[], text[]) TO authenticated;

COMMENT ON FUNCTION public.set_restaurant_field_locks(uuid, text[], text[]) IS
  'WEB-BE-069: admins lock the restaurant fields an edit changed, or clear a lock so the next Google enrichment fills the field again.';
