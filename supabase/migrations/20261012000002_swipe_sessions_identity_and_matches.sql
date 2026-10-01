-- IOS-DD-DISCOVER-02: bind a session participant to the caller, show a
-- session's matches only to its members, and draw session codes evenly.
--
-- As defined in 20260506000011_swipe_sessions.sql:
--   * The participants INSERT policy checks only that the session is active.
--     Nothing ties user_id to auth.uid(), so anyone could add a victim's
--     user_id to a session, or flood one with anon rows carrying unbounded
--     display_name text.
--   * get_swipe_session_matches is plain LANGUAGE sql, so it runs under the
--     swipe_interactions SELECT policy (auth.uid() = user_id). A caller only
--     ever sees their own likes, and a match needs two people, so it could
--     never return a row. Making it SECURITY DEFINER without a membership
--     check would hand any session's likes to anyone with its id.
--   * generate_swipe_session_code used (random() * 35)::int + 1, which
--     rounds: 'A' and '9' were drawn at half the weight of the rest.
--
-- BACKWARD COMPATIBILITY. Additive only. The trigger rewrites identity on
-- insert; shipped iOS and Android clients already send their own uid (or, on
-- iOS, a device anon_id when signed out), so their inserts are unchanged. The
-- two functions keep their exact signatures and return columns. The RLS
-- policies are not touched here: Android's GroupSessionRemoteDataSource reads
-- these tables directly, so tightening them follows the deprecation flow
-- (D7-DEF-02).

-- ---------------------------------------------------------------------------
-- 1. Participant guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.swipe_session_participant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  -- Server-side writers (service role) are trusted as they are.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    -- A signed-in caller joins as themselves, whatever the body said.
    NEW.user_id := auth.uid();
    NEW.anon_id := NULL;
  ELSE
    NEW.user_id := NULL;
    IF NEW.anon_id IS NULL OR length(NEW.anon_id) > 64 THEN
      RAISE EXCEPTION 'A guest participant needs a device id of at most 64 characters'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.display_name := left(nullif(btrim(NEW.display_name), ''), 40);

  -- Someone already in the session falls through to the unique index, which
  -- answers 23505 ("already joined") rather than "full".
  IF EXISTS (
    SELECT 1 FROM swipe_session_participants p
    WHERE p.session_id = NEW.session_id
      AND ((NEW.user_id IS NOT NULL AND p.user_id = NEW.user_id)
        OR (NEW.anon_id IS NOT NULL AND p.anon_id = NEW.anon_id))
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM swipe_session_participants p
  WHERE p.session_id = NEW.session_id;

  IF v_count >= 12 THEN
    RAISE EXCEPTION 'This session is full' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swipe_session_participant_guard ON public.swipe_session_participants;
CREATE TRIGGER swipe_session_participant_guard
  BEFORE INSERT ON public.swipe_session_participants
  FOR EACH ROW EXECUTE FUNCTION public.swipe_session_participant_guard();

-- ---------------------------------------------------------------------------
-- 2. Matches, for members only, over visible rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_swipe_session_matches(p_session_id UUID)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  match_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only a participant or the host may see what a session liked. A guest
  -- (no auth.uid()) cannot prove membership and gets nothing.
  IF NOT EXISTS (
    SELECT 1 FROM swipe_session_participants p
    WHERE p.session_id = p_session_id AND p.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM swipe_sessions s
    WHERE s.id = p_session_id AND s.host_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    si.item_type,
    si.item_id,
    COUNT(DISTINCT COALESCE(si.user_id::text, si.anon_id))
  FROM swipe_interactions si
  LEFT JOIN events e
    ON si.item_type = 'event' AND e.id = si.item_id
  LEFT JOIN restaurants r
    ON si.item_type = 'restaurant' AND r.id = si.item_id
  WHERE si.session_id = p_session_id
    AND si.action IN ('like', 'boost')
    AND (
      (si.item_type = 'event' AND e.id IS NOT NULL
        AND e.is_merged IS NOT TRUE AND e.is_hidden IS NOT TRUE AND e.archived_at IS NULL)
      OR (si.item_type = 'restaurant' AND r.id IS NOT NULL
        AND r.is_merged IS NOT TRUE
        AND coalesce(upper(r.business_status), '') <> 'CLOSED_PERMANENTLY')
      OR si.item_type = 'attraction'
    )
  GROUP BY si.item_type, si.item_id
  HAVING COUNT(DISTINCT COALESCE(si.user_id::text, si.anon_id)) >= 2
  ORDER BY 3 DESC, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swipe_session_matches(UUID)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_swipe_session_matches(UUID) IS
  'Items right-swiped by 2+ distinct participants in a session, for members of that session only (IOS-DD-DISCOVER-02).';

-- ---------------------------------------------------------------------------
-- 3. Session code, uniform over the 36 characters
-- ---------------------------------------------------------------------------

-- Same signature and DSM-XXXX format (shipped clients validate
-- ^DSM-[A-Z0-9]{4}$). floor(random() * 36) is 0..35, each equally likely.
CREATE OR REPLACE FUNCTION public.generate_swipe_session_code()
RETURNS TEXT AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_code TEXT;
  i INT;
BEGIN
  FOR attempt IN 1..8 LOOP
    v_code := 'DSM-';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(v_chars, floor(random() * 36)::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.swipe_sessions WHERE code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;
  RETURN v_code; -- fall through; UNIQUE constraint will surface the collision
END;
$$ LANGUAGE plpgsql VOLATILE;

GRANT EXECUTE ON FUNCTION public.generate_swipe_session_code() TO authenticated;
