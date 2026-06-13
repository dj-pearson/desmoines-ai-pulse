-- WEB-AUTO-005: merge / unmerge / dismiss RPCs (SECURITY DEFINER).
--
-- Auth model (mirrors the project's admin-gated definer pattern): the service
-- role (cron, auth.uid() IS NULL) and admin users may call; any other
-- authenticated user is rejected. REVOKE FROM PUBLIC + GRANT to
-- authenticated/service_role. search_path pinned.

-- ===========================================================================
-- merge_duplicate_content — keep p_survivor, fold p_loser into it.
-- Generically repoints EVERY single-column FK that references the parent
-- table's id (favorites, reviews, sponsored links, …) loser → survivor, with a
-- ctid row-by-row fallback that drops only the rows that would collide on a
-- unique/check constraint. Marks the loser is_merged (RETAINED, reversible) and
-- writes an immutable content_merges audit row.
-- ===========================================================================
CREATE OR REPLACE FUNCTION merge_duplicate_content(
  p_type       TEXT,
  p_survivor   UUID,
  p_loser      UUID,
  p_confidence REAL DEFAULT NULL,
  p_reason     TEXT DEFAULT NULL,
  p_auto       BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_regclass  regclass;
  v_rec       RECORD;
  v_child_row RECORD;
  v_count     BIGINT;
  v_repointed JSONB := '{}'::jsonb;
  v_merge_id  UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  IF p_type NOT IN ('event', 'restaurant') THEN
    RAISE EXCEPTION 'unsupported content type: %', p_type;
  END IF;
  IF p_survivor = p_loser THEN
    RAISE EXCEPTION 'survivor and loser must differ';
  END IF;

  v_regclass := (CASE p_type WHEN 'event' THEN 'public.events'
                             WHEN 'restaurant' THEN 'public.restaurants' END)::regclass;

  -- Repoint every child FK that points at <parent>.id.
  FOR v_rec IN
    SELECT c.conrelid::regclass AS child_tbl, a.attname AS child_col
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = v_regclass
      AND array_length(c.conkey, 1) = 1
      AND fa.attname = 'id'
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2',
                     v_rec.child_tbl, v_rec.child_col, v_rec.child_col)
        USING p_survivor, p_loser;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    EXCEPTION WHEN unique_violation OR check_violation THEN
      -- Bulk update hit a collision; move rows one-by-one and delete only the
      -- genuine duplicates (the survivor already has the equivalent child row).
      v_count := 0;
      FOR v_child_row IN
        EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', v_rec.child_tbl, v_rec.child_col)
          USING p_loser
      LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', v_rec.child_tbl, v_rec.child_col)
            USING p_survivor, v_child_row.ctid;
          v_count := v_count + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          EXECUTE format('DELETE FROM %s WHERE ctid = $1', v_rec.child_tbl)
            USING v_child_row.ctid;
        END;
      END LOOP;
    END;
    v_repointed := v_repointed || jsonb_build_object(v_rec.child_tbl::text || '.' || v_rec.child_col, v_count);
  END LOOP;

  -- Mark the loser merged (retained for reversibility).
  EXECUTE format('UPDATE %s SET is_merged = true, merged_into = $1, merged_at = now() WHERE id = $2', v_regclass)
    USING p_survivor, p_loser;

  INSERT INTO content_merges (content_type, survivor_id, loser_id, confidence, reason, auto, repointed, merged_by)
  VALUES (p_type, p_survivor, p_loser, p_confidence, p_reason, p_auto, v_repointed, auth.uid())
  RETURNING id INTO v_merge_id;

  -- Resolve any queued candidate for this pair (either ordering).
  UPDATE content_merge_candidates
  SET status = 'merged', resolved_at = now(), resolved_by = auth.uid()
  WHERE content_type = p_type
    AND status = 'pending'
    AND ((a_id = p_survivor AND b_id = p_loser) OR (a_id = p_loser AND b_id = p_survivor));

  RETURN v_merge_id;
END;
$$;

-- ===========================================================================
-- unmerge_content — reverse a merge within 30 days. Restores the loser row's
-- visibility. (Children already repointed to the survivor stay there — moving
-- them back is not safe to automate; documented in AUTOMATION_JOBS.md.)
-- ===========================================================================
CREATE OR REPLACE FUNCTION unmerge_content(p_merge_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_merge     content_merges%ROWTYPE;
  v_regclass  regclass;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT * INTO v_merge FROM content_merges WHERE id = p_merge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge % not found', p_merge_id;
  END IF;
  IF v_merge.reversed THEN
    RAISE EXCEPTION 'merge % already reversed', p_merge_id;
  END IF;
  IF v_merge.created_at < now() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'merge % is older than 30 days and can no longer be reversed', p_merge_id;
  END IF;

  v_regclass := (CASE v_merge.content_type WHEN 'event' THEN 'public.events'
                                            WHEN 'restaurant' THEN 'public.restaurants' END)::regclass;

  EXECUTE format('UPDATE %s SET is_merged = false, merged_into = NULL, merged_at = NULL WHERE id = $1', v_regclass)
    USING v_merge.loser_id;

  UPDATE content_merges
  SET reversed = true, reversed_at = now(), reversed_by = auth.uid()
  WHERE id = p_merge_id;
END;
$$;

-- ===========================================================================
-- dismiss_merge_candidate — admin marks a queued pair "not a duplicate".
-- ===========================================================================
CREATE OR REPLACE FUNCTION dismiss_merge_candidate(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  UPDATE content_merge_candidates
  SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_id AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION merge_duplicate_content(TEXT, UUID, UUID, REAL, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION unmerge_content(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION dismiss_merge_candidate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_duplicate_content(TEXT, UUID, UUID, REAL, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION unmerge_content(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dismiss_merge_candidate(UUID) TO authenticated, service_role;
