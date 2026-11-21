-- WEB-BE-074: merging duplicate restaurants keeps the loser's data, moves its
-- owner claims, prefers the Google-linked row, and Undo puts both back.
--
-- Before this, merge_duplicate_content() (20260612000010) repointed foreign-key
-- children and hid the loser. Three things went wrong on restaurants:
--   * No column was copied. A survivor without hours, coordinates, a phone or
--     a google_place_id stayed without them while the loser, now hidden, had
--     them. Without a place id the survivor also dropped out of the hours and
--     closure refresh.
--   * business_claims.listing_id has no foreign key, so a claim on the loser
--     stayed there and the owner kept editing a row nobody can see.
--   * The survivor score (image, featured, rating, description length) let a
--     long scraped row beat the Google-linked or owner-claimed one.
--
-- What changes:
--   * content_merges gains filled_columns and moved_claims (nullable, additive)
--     so a merge records what it copied and which claims it moved.
--   * merge_duplicate_content() fills the survivor's empty columns from the
--     loser and moves the loser's claims, then does what it always did.
--   * unmerge_content() clears the copied values that nobody has edited since
--     and moves the claims back. Repointed foreign-key children still stay
--     with the survivor, as before.
--   * restaurant_merge_rank() is the one survivor rule: place id, then a
--     verified claim, then the old score. find_duplicate_restaurants() returns
--     it as a_richness/b_richness, so the dedupe-content edge function picks
--     the survivor by it without a code change.
--   * suggest_merge_survivor() lets the admin's on-demand merge form show the
--     same choice before the admin confirms.
--
-- Backward compatible: every existing function keeps its signature and return
-- type; the two new columns are nullable.

ALTER TABLE public.content_merges
  ADD COLUMN IF NOT EXISTS filled_columns jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS moved_claims uuid[] DEFAULT '{}'::uuid[];

-- ---------------------------------------------------------------------------
-- Survivor rule. 1000 for a place id and 100 for a verified claim sit above the
-- old score, whose maximum is 11, so the order is place id, claim, then score.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_merge_rank(p_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
      (CASE WHEN NULLIF(btrim(r.google_place_id), '') IS NOT NULL THEN 1000 ELSE 0 END)
    + (CASE WHEN EXISTS (
         SELECT 1 FROM public.business_claims c
         WHERE c.listing_type = 'restaurant' AND c.listing_id = r.id AND c.status = 'verified'
       ) THEN 100 ELSE 0 END)
    + (CASE WHEN r.image_url IS NOT NULL AND r.image_url <> '' THEN 2 ELSE 0 END)
    + (CASE WHEN r.is_featured THEN 3 ELSE 0 END)
    + (CASE WHEN r.rating IS NOT NULL THEN 1 ELSE 0 END)
    + LEAST(5, length(COALESCE(r.description, r.ai_writeup, ''))::numeric / 200)
  FROM public.restaurants r
  WHERE r.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_restaurants(
  p_threshold numeric DEFAULT 0.7,
  p_max integer DEFAULT 200
)
RETURNS TABLE (
  a_id uuid,
  b_id uuid,
  name_sim real,
  distance_m double precision,
  same_date boolean,
  a_richness numeric,
  b_richness numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id,
    b.id,
    similarity(a.name, b.name) AS name_sim,
    CASE
      WHEN a.latitude IS NOT NULL AND b.latitude IS NOT NULL
       AND a.longitude IS NOT NULL AND b.longitude IS NOT NULL THEN
        6371000 * acos(LEAST(1, GREATEST(-1,
          sin(radians(a.latitude)) * sin(radians(b.latitude)) +
          cos(radians(a.latitude)) * cos(radians(b.latitude)) *
          cos(radians(a.longitude - b.longitude))
        )))
    END AS distance_m,
    NULL::boolean AS same_date,
    public.restaurant_merge_rank(a.id) AS a_richness,
    public.restaurant_merge_rank(b.id) AS b_richness
  FROM public.restaurants a
  JOIN public.restaurants b ON a.id < b.id
  WHERE COALESCE(a.is_merged, false) = false
    AND COALESCE(b.is_merged, false) = false
    AND a.name % b.name
    AND similarity(a.name, b.name) >= p_threshold
  ORDER BY similarity(a.name, b.name) DESC
  LIMIT p_max;
$$;

-- Which of two restaurants a merge should keep. Ties keep the smaller id, the
-- same tie-break the dedupe-content job uses.
CREATE OR REPLACE FUNCTION public.suggest_merge_survivor(
  p_content_type text,
  p_a uuid,
  p_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a numeric;
  v_b numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_content_type <> 'restaurant' THEN
    RAISE EXCEPTION 'only restaurants are supported' USING ERRCODE = '22023';
  END IF;
  v_a := public.restaurant_merge_rank(p_a);
  v_b := public.restaurant_merge_rank(p_b);
  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'restaurant not found' USING ERRCODE = '22023';
  END IF;
  IF v_a > v_b OR (v_a = v_b AND p_a < p_b) THEN
    RETURN p_a;
  END IF;
  RETURN p_b;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fill the survivor's empty columns from the loser. Returns
-- {column: {"was": old, "value": copied}} so unmerge can put them back.
-- A column missing from this database is skipped (the row snapshot has no key
-- for it). Coordinates move as a pair, never one half. A value the database
-- refuses (a unique index on google_place_id, say) is skipped, not fatal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coalesce_restaurant_from_loser(p_survivor uuid, p_loser uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cols text[] := ARRAY[
    'google_place_id', 'hours_json', 'phone', 'website', 'menu_url', 'image_url',
    'description', 'ai_writeup', 'cuisine', 'price_range', 'neighborhood',
    'location', 'city', 'opening_date', 'source_url', 'rating'
  ];
  v_empty jsonb[] := ARRAY['null'::jsonb, '""'::jsonb, '{}'::jsonb, '[]'::jsonb];
  v_col text;
  v_s jsonb;
  v_l jsonb;
  v_filled jsonb := '{}'::jsonb;
BEGIN
  SELECT to_jsonb(r) INTO v_s FROM public.restaurants r WHERE r.id = p_survivor;
  SELECT to_jsonb(r) INTO v_l FROM public.restaurants r WHERE r.id = p_loser;
  IF v_s IS NULL OR v_l IS NULL THEN
    RETURN v_filled;
  END IF;

  FOREACH v_col IN ARRAY v_cols LOOP
    CONTINUE WHEN NOT (v_s ? v_col);
    CONTINUE WHEN NOT (v_s->v_col = ANY (v_empty));
    CONTINUE WHEN v_l->v_col = ANY (v_empty);
    BEGIN
      EXECUTE format(
        'UPDATE public.restaurants SET %I = (jsonb_populate_record(NULL::public.restaurants, $1)).%I WHERE id = $2',
        v_col, v_col
      ) USING jsonb_build_object(v_col, v_l->v_col), p_survivor;
      v_filled := v_filled || jsonb_build_object(
        v_col, jsonb_build_object('was', v_s->v_col, 'value', v_l->v_col)
      );
    EXCEPTION WHEN unique_violation OR check_violation THEN
      NULL;
    END;
  END LOOP;

  IF (v_s ? 'latitude') AND (v_s ? 'longitude')
     AND (v_s->'latitude' = 'null'::jsonb OR v_s->'longitude' = 'null'::jsonb)
     AND v_l->'latitude' <> 'null'::jsonb AND v_l->'longitude' <> 'null'::jsonb THEN
    UPDATE public.restaurants
      SET latitude = (v_l->>'latitude')::double precision,
          longitude = (v_l->>'longitude')::double precision
      WHERE id = p_survivor;
    v_filled := v_filled
      || jsonb_build_object('latitude', jsonb_build_object('was', v_s->'latitude', 'value', v_l->'latitude'))
      || jsonb_build_object('longitude', jsonb_build_object('was', v_s->'longitude', 'value', v_l->'longitude'));
  END IF;

  RETURN v_filled;
END;
$$;

-- ---------------------------------------------------------------------------
-- Merge. Same contract as 20260612000010; the restaurant branch now copies
-- columns and moves claims first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_duplicate_content(
  p_content_type text,
  p_survivor uuid,
  p_loser uuid,
  p_confidence numeric DEFAULT NULL,
  p_decided_by text DEFAULT 'system'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table regclass;
  v_fk RECORD;
  v_rec RECORD;
  v_moved integer;
  v_repointed jsonb := '{}'::jsonb;
  v_merge_id uuid;
  v_filled jsonb := '{}'::jsonb;
  v_claims uuid[] := '{}'::uuid[];
  v_claim_conflicts integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to merge content';
  END IF;

  IF p_content_type = 'event' THEN
    v_table := 'public.events'::regclass;
  ELSIF p_content_type = 'restaurant' THEN
    v_table := 'public.restaurants'::regclass;
  ELSE
    RAISE EXCEPTION 'invalid content_type: %', p_content_type;
  END IF;

  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RAISE EXCEPTION 'survivor and loser must be distinct non-null ids';
  END IF;

  IF p_content_type = 'restaurant' THEN
    v_filled := public.coalesce_restaurant_from_loser(p_survivor, p_loser);

    -- Move claims one at a time. A second verified owner (or the same person's
    -- open claim on both rows) collides with a unique index; that claim stays
    -- on the loser for an admin to settle and is counted below.
    IF to_regclass('public.business_claims') IS NOT NULL THEN
      FOR v_rec IN
        SELECT c.id FROM public.business_claims c
        WHERE c.listing_type = 'restaurant' AND c.listing_id = p_loser
        ORDER BY (c.status = 'verified') DESC, c.created_at
      LOOP
        BEGIN
          UPDATE public.business_claims
            SET listing_id = p_survivor, updated_at = now()
            WHERE id = v_rec.id;
          v_claims := v_claims || v_rec.id;
        EXCEPTION WHEN unique_violation THEN
          v_claim_conflicts := v_claim_conflicts + 1;
        END;
      END LOOP;
      IF array_length(v_claims, 1) > 0 THEN
        v_repointed := v_repointed || jsonb_build_object('business_claims.listing_id', array_length(v_claims, 1));
      END IF;
      IF v_claim_conflicts > 0 THEN
        v_repointed := v_repointed || jsonb_build_object('business_claims.left_on_loser', v_claim_conflicts);
      END IF;
    END IF;
  END IF;

  FOR v_fk IN
    SELECT cl.relname AS child_table, att.attname AS child_col
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    JOIN pg_attribute ratt ON ratt.attrelid = con.confrelid AND ratt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = v_table
      AND ratt.attname = 'id'
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET %I = $1 WHERE %I = $2',
        v_fk.child_table, v_fk.child_col, v_fk.child_col
      ) USING p_survivor, p_loser;
      GET DIAGNOSTICS v_moved = ROW_COUNT;
    EXCEPTION WHEN unique_violation OR check_violation THEN
      v_moved := 0;
      FOR v_rec IN EXECUTE format(
        'SELECT ctid AS c FROM public.%I WHERE %I = $1', v_fk.child_table, v_fk.child_col
      ) USING p_loser
      LOOP
        BEGIN
          EXECUTE format(
            'UPDATE public.%I SET %I = $1 WHERE ctid = $2', v_fk.child_table, v_fk.child_col
          ) USING p_survivor, v_rec.c;
          v_moved := v_moved + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', v_fk.child_table) USING v_rec.c;
        END;
      END LOOP;
    END;

    IF v_moved > 0 THEN
      v_repointed := v_repointed || jsonb_build_object(v_fk.child_table || '.' || v_fk.child_col, v_moved);
    END IF;
  END LOOP;

  EXECUTE format(
    'UPDATE %s SET is_merged = true, merged_into = $1, merged_at = now(), updated_at = now() WHERE id = $2',
    v_table
  ) USING p_survivor, p_loser;

  INSERT INTO public.content_merges
    (content_type, survivor_id, loser_id, confidence, decided_by, repointed, filled_columns, moved_claims)
  VALUES
    (p_content_type, p_survivor, p_loser, p_confidence, COALESCE(NULLIF(p_decided_by, ''), 'system'),
     v_repointed, v_filled, v_claims)
  RETURNING id INTO v_merge_id;

  UPDATE public.content_merge_candidates
    SET status = 'merged', resolved_at = now(), resolved_by = auth.uid()
    WHERE content_type = p_content_type
      AND status = 'pending'
      AND ( (survivor_id = p_survivor AND loser_id = p_loser)
         OR (survivor_id = p_loser AND loser_id = p_survivor) );

  RETURN v_merge_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Unmerge within 30 days. Restores the loser, clears each value the merge
-- copied onto the survivor unless it has been changed since, and moves the
-- moved claims back. Repointed foreign-key children stay with the survivor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unmerge_content(p_merge_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m RECORD;
  v_table regclass;
  v_col text;
  v_entry jsonb;
  v_claim uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to unmerge content';
  END IF;

  SELECT * INTO m FROM public.content_merges WHERE id = p_merge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge % not found', p_merge_id;
  END IF;
  IF m.reversed THEN
    RETURN true;
  END IF;
  IF m.created_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'merge is older than 30 days and can no longer be reversed';
  END IF;

  v_table := CASE WHEN m.content_type = 'event'
                  THEN 'public.events'::regclass
                  ELSE 'public.restaurants'::regclass END;

  EXECUTE format(
    'UPDATE %s SET is_merged = false, merged_into = NULL, merged_at = NULL, updated_at = now() WHERE id = $1',
    v_table
  ) USING m.loser_id;

  IF m.content_type = 'restaurant' THEN
    FOR v_col, v_entry IN SELECT key, value FROM jsonb_each(COALESCE(m.filled_columns, '{}'::jsonb)) LOOP
      EXECUTE format(
        'UPDATE public.restaurants SET %I = (jsonb_populate_record(NULL::public.restaurants, $1)).%I '
        'WHERE id = $2 AND to_jsonb(%I) IS NOT DISTINCT FROM $3',
        v_col, v_col, v_col
      ) USING jsonb_build_object(v_col, v_entry->'was'), m.survivor_id, v_entry->'value';
    END LOOP;

    IF to_regclass('public.business_claims') IS NOT NULL THEN
      FOREACH v_claim IN ARRAY COALESCE(m.moved_claims, '{}'::uuid[]) LOOP
        BEGIN
          UPDATE public.business_claims
            SET listing_id = m.loser_id, updated_at = now()
            WHERE id = v_claim AND listing_type = 'restaurant' AND listing_id = m.survivor_id;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.content_merges
    SET reversed = true, reversed_at = now(), reversed_by = auth.uid()
    WHERE id = p_merge_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_merge_rank(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coalesce_restaurant_from_loser(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suggest_merge_survivor(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_duplicate_restaurants(numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_content(text, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unmerge_content(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.restaurant_merge_rank(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.coalesce_restaurant_from_loser(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.suggest_merge_survivor(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_restaurants(numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_content(text, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unmerge_content(uuid) TO authenticated, service_role;
