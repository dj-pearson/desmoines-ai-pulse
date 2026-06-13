-- WEB-AUTO-005: duplicate detection + merge/unmerge RPCs.
-- pg_trgm is already enabled with GIN indexes on events(title) and restaurants(name)
-- by 20250107000007_add_fuzzy_search.sql, so the `%` similarity operator below uses
-- the index. All functions pin search_path and are revoked from PUBLIC; the mutating
-- ones additionally check is_admin() for any authenticated (non-service-role) caller.

-- ---------------------------------------------------------------------------
-- Candidate finders (self-join, trigram + proximity). Used by the edge function.
-- Returns both rows' richness so the caller can pick the row to keep without
-- extra round-trips. `same_date` is always true for events (we require it to
-- bound the join) and null for restaurants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_duplicate_events(
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
    similarity(a.title, b.title) AS name_sim,
    CASE
      WHEN a.latitude IS NOT NULL AND b.latitude IS NOT NULL
       AND a.longitude IS NOT NULL AND b.longitude IS NOT NULL THEN
        6371000 * acos(LEAST(1, GREATEST(-1,
          sin(radians(a.latitude)) * sin(radians(b.latitude)) +
          cos(radians(a.latitude)) * cos(radians(b.latitude)) *
          cos(radians(a.longitude - b.longitude))
        )))
    END AS distance_m,
    true AS same_date,
    ( (CASE WHEN a.image_url IS NOT NULL AND a.image_url <> '' THEN 2 ELSE 0 END)
    + (CASE WHEN a.is_featured THEN 3 ELSE 0 END)
    + (CASE WHEN a.is_enhanced THEN 1 ELSE 0 END)
    + LEAST(5, length(COALESCE(a.enhanced_description, a.original_description, a.ai_writeup, ''))::numeric / 200)
    ) AS a_richness,
    ( (CASE WHEN b.image_url IS NOT NULL AND b.image_url <> '' THEN 2 ELSE 0 END)
    + (CASE WHEN b.is_featured THEN 3 ELSE 0 END)
    + (CASE WHEN b.is_enhanced THEN 1 ELSE 0 END)
    + LEAST(5, length(COALESCE(b.enhanced_description, b.original_description, b.ai_writeup, ''))::numeric / 200)
    ) AS b_richness
  FROM public.events a
  JOIN public.events b ON a.id < b.id
  WHERE COALESCE(a.is_merged, false) = false
    AND COALESCE(b.is_merged, false) = false
    AND a.date::date = b.date::date           -- same calendar day bounds the self-join
    AND a.title % b.title                       -- trigram index probe
    AND similarity(a.title, b.title) >= p_threshold
  ORDER BY similarity(a.title, b.title) DESC
  LIMIT p_max;
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
    ( (CASE WHEN a.image_url IS NOT NULL AND a.image_url <> '' THEN 2 ELSE 0 END)
    + (CASE WHEN a.is_featured THEN 3 ELSE 0 END)
    + (CASE WHEN a.rating IS NOT NULL THEN 1 ELSE 0 END)
    + LEAST(5, length(COALESCE(a.description, a.ai_writeup, ''))::numeric / 200)
    ) AS a_richness,
    ( (CASE WHEN b.image_url IS NOT NULL AND b.image_url <> '' THEN 2 ELSE 0 END)
    + (CASE WHEN b.is_featured THEN 3 ELSE 0 END)
    + (CASE WHEN b.rating IS NOT NULL THEN 1 ELSE 0 END)
    + LEAST(5, length(COALESCE(b.description, b.ai_writeup, ''))::numeric / 200)
    ) AS b_richness
  FROM public.restaurants a
  JOIN public.restaurants b ON a.id < b.id
  WHERE COALESCE(a.is_merged, false) = false
    AND COALESCE(b.is_merged, false) = false
    AND a.name % b.name                         -- trigram index probe
    AND similarity(a.name, b.name) >= p_threshold
  ORDER BY similarity(a.name, b.name) DESC
  LIMIT p_max;
$$;

-- ---------------------------------------------------------------------------
-- Merge: repoint every child FK loser -> survivor, mark the loser merged, audit.
-- Dynamic over pg_constraint so favorites (user_event_interactions), reviews,
-- attendance, sponsored links and any future child table are all handled without
-- enumerating them. Unique/check collisions (e.g. a user who favorited both rows)
-- fall back to a row-by-row move that drops the loser's duplicate child row.
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
BEGIN
  -- authz: service role (no JWT) or an admin user only
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

  -- Repoint each single-column FK that references <table>.id.
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
      -- Move surviving children one at a time; drop the loser's true duplicates.
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

  -- Mark the loser merged (retained, not deleted, so the merge stays reversible).
  EXECUTE format(
    'UPDATE %s SET is_merged = true, merged_into = $1, merged_at = now(), updated_at = now() WHERE id = $2',
    v_table
  ) USING p_survivor, p_loser;

  INSERT INTO public.content_merges (content_type, survivor_id, loser_id, confidence, decided_by, repointed)
  VALUES (p_content_type, p_survivor, p_loser, p_confidence, COALESCE(NULLIF(p_decided_by, ''), 'system'), v_repointed)
  RETURNING id INTO v_merge_id;

  -- Close out any pending review-queue entry for this pair (either orientation).
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
-- Unmerge: restore the loser row within the 30-day window. Repointed child rows
-- stay with the survivor (they were genuine duplicates); the duplicate listing
-- simply reappears so an admin can re-evaluate.
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

  UPDATE public.content_merges
    SET reversed = true, reversed_at = now(), reversed_by = auth.uid()
    WHERE id = p_merge_id;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Dismiss a review-queue candidate (admin action; RLS blocks direct UPDATE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_merge_candidate(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.content_merge_candidates
    SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Lock down execute grants (Supabase exposes PUBLIC-executable functions via PostgREST).
REVOKE ALL ON FUNCTION public.find_duplicate_events(numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_duplicate_restaurants(numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_content(text, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unmerge_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_merge_candidate(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.find_duplicate_events(numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_restaurants(numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_content(text, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unmerge_content(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_merge_candidate(uuid) TO authenticated, service_role;
