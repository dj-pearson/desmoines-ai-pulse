-- IOS-DD-GUIDES-06 / IOS-DD-GUIDES-08: Best Of ballot integrity, write-in
-- hygiene, and an award RPC that only crowns a finished round.
--
-- What was wrong
--   * The votes policies (20260226000003, 20260930000003) check only
--     auth.uid() = user_id. A signed-in caller could vote in an inactive or
--     closed category, for an entity id that does not exist, or submit an
--     unbounded custom_entry (a URL, a paragraph, a slur) that
--     voting_results() then served to anon verbatim.
--   * voting_results() grouped write-ins on the exact string, so "Zombie
--     Burger" and "zombie burger " were two rows.
--   * voting_winners() (20260823000001) crowns the leader of any active
--     category after a single vote, and iOS feeds that into the app-wide
--     award badge.
--
-- Compatibility
--   * votes_guard rejects only writes the apps never make for an open round:
--     a closed or inactive category, a missing entity, a URL or empty
--     write-in. Admins and service_role bypass it.
--   * voting_results keeps its exact RETURNS TABLE shape. Rows are only
--     merged (case/punctuation variants of one write-in) or withheld (a
--     write-in with fewer than 3 backers), which old clients tolerate: they
--     already render whatever rows come back.
--   * voting_winners is untouched: the web's BestOf.tsx shows it as "current
--     leaders". The badge moves to the new voting_award_winners().

-- ------------------------------------------------------------ write-in key
CREATE OR REPLACE FUNCTION public.vote_entry_key(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(regexp_replace(btrim($1), '[[:punct:]]', '', 'g'), '\s+', ' ', 'g'));
$$;

-- ------------------------------------------------------------ votes_guard
CREATE OR REPLACE FUNCTION public.votes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.voting_categories c
    WHERE c.id = NEW.category_id
      AND COALESCE(c.is_active, true)
      AND now() >= COALESCE(c.voting_start, '-infinity'::timestamptz)
      AND now() <  COALESCE(c.voting_end, 'infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'voting_closed' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.entity_type = 'custom' THEN
    IF NEW.entity_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_write_in' USING ERRCODE = 'P0001';
    END IF;
    NEW.custom_entry := left(regexp_replace(btrim(COALESCE(NEW.custom_entry, '')), '\s+', ' ', 'g'), 80);
    IF NEW.custom_entry = '' OR NEW.custom_entry ~* '(https?:|://|www\.)' THEN
      RAISE EXCEPTION 'invalid_write_in' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.entity_id IS NULL
     OR (NEW.entity_type = 'restaurant'
         AND NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = NEW.entity_id))
     OR (NEW.entity_type = 'attraction'
         AND NOT EXISTS (SELECT 1 FROM public.attractions a WHERE a.id = NEW.entity_id))
     OR (NEW.entity_type = 'event'
         AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.entity_id))
  THEN
    RAISE EXCEPTION 'unknown_entity' USING ERRCODE = 'P0001';
  END IF;
  NEW.custom_entry := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS votes_guard ON public.votes;
CREATE TRIGGER votes_guard
  BEFORE INSERT OR UPDATE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.votes_guard();

-- ------------------------------------------------------------ voting_results
-- Same signature and return shape as 20260822000013.
CREATE OR REPLACE FUNCTION public.voting_results(p_category_id uuid)
RETURNS TABLE (
  entity_type  text,
  entity_id    uuid,
  custom_entry text,
  vote_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    min(v.entity_type)                                          AS entity_type,
    v.entity_id,
    CASE WHEN v.entity_id IS NULL THEN min(btrim(v.custom_entry)) END AS custom_entry,
    count(*)::bigint                                            AS vote_count
  FROM public.votes v
  WHERE v.category_id = p_category_id
  GROUP BY v.entity_id, CASE WHEN v.entity_id IS NULL THEN public.vote_entry_key(v.custom_entry) END
  -- A write-in reaches the public board only once 3 accounts back it, so one
  -- account cannot publish arbitrary text.
  HAVING v.entity_id IS NOT NULL OR count(*) >= 3
  ORDER BY count(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.voting_results(uuid) TO anon, authenticated;

-- ------------------------------------------------------ voting_award_winners
-- The award badge: the outright winner of a round that has ENDED, with at
-- least p_min_votes votes. A tie at the top awards nothing. Write-ins are
-- excluded (nothing to badge). No user_id, no vote ids.
CREATE OR REPLACE FUNCTION public.voting_award_winners(p_min_votes int DEFAULT 5)
RETURNS TABLE (
  category_id   uuid,
  category_name text,
  entity_id     uuid,
  vote_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH counts AS (
    SELECT v.category_id, c.name AS category_name, v.entity_id, count(*)::bigint AS cnt
    FROM public.votes v
    JOIN public.voting_categories c ON c.id = v.category_id
    WHERE v.entity_id IS NOT NULL
      AND c.is_active
      AND c.voting_end IS NOT NULL
      AND c.voting_end <= now()
    GROUP BY v.category_id, c.name, v.entity_id
  ),
  ranked AS (
    SELECT
      counts.*,
      row_number() OVER w AS rn,
      lead(cnt) OVER w AS next_cnt
    FROM counts
    WINDOW w AS (PARTITION BY counts.category_id ORDER BY cnt DESC, counts.entity_id)
  )
  SELECT r.category_id, r.category_name, r.entity_id, r.cnt
  FROM ranked r
  WHERE r.rn = 1
    AND r.cnt >= GREATEST(p_min_votes, 1)
    AND (r.next_cnt IS NULL OR r.cnt > r.next_cnt);
$$;

REVOKE ALL ON FUNCTION public.voting_award_winners(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voting_award_winners(int) TO anon, authenticated;

COMMENT ON FUNCTION public.voting_award_winners(int) IS
  'Outright winner per ended, active voting category with at least p_min_votes votes; ties award nothing (IOS-DD-GUIDES-08).';
