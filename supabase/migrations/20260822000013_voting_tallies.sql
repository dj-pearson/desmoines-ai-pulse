-- IOS-AUDIT-PERF-026: aggregate Best-Of tallies server-side.
--
-- All three clients currently download RAW VOTE ROWS and count them in the app:
--   iOS      VotingService.swift:43-50 and :70-76
--   Android  BestOfRemoteDataSource.kt:40, :59, :123
--   web      useVoting.ts
-- So the work each client does grows with total votes cast app-wide, and the
-- bytes on the wire grow with it too. votes holds 0 rows today, so nothing is
-- slow yet -- this is the shape being fixed before it matters, not a live
-- regression.
--
-- SECOND REASON, and the more important one. `votes` carries user_id and its
-- only SELECT policy is
--     "Public read votes"  cmd=SELECT  roles={public}  USING (true)
-- so anyone holding the anon key that ships in the client bundle can enumerate
-- WHO VOTED FOR WHAT. A Best-Of ballot is not meant to be a public record.
-- These functions are what makes closing that possible: once every client reads
-- tallies instead of rows, the raw table can be restricted to a user's own
-- votes. That tightening is NOT done here -- three shipped clients read the
-- table directly, so it has to follow the multi-release flow in CLAUDE.md.
-- Tracked as WEB-SEC-025.

/**
 * Vote count per active category.
 */
CREATE OR REPLACE FUNCTION public.voting_category_tallies()
RETURNS TABLE (category_id uuid, vote_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.category_id, count(*)::bigint
  FROM public.votes v
  GROUP BY v.category_id;
$$;

/**
 * Leaderboard for one category.
 *
 * Grouping mirrors the clients' own aggregation exactly: by entity_id when
 * present, otherwise by the free-text custom_entry (VoteResult.aggregate keys on
 * `entityId ?? customEntry`). Ordered by count descending, as they do.
 *
 * Returns no user_id and no vote ids -- the point is that a caller learns the
 * tallies without learning the ballots.
 */
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
    -- One entity could in principle be voted under two entity_types; min() keeps
    -- the function deterministic rather than letting the planner pick.
    min(v.entity_type)                                  AS entity_type,
    v.entity_id,
    CASE WHEN v.entity_id IS NULL THEN v.custom_entry END AS custom_entry,
    count(*)::bigint                                    AS vote_count
  FROM public.votes v
  WHERE v.category_id = p_category_id
  GROUP BY v.entity_id, CASE WHEN v.entity_id IS NULL THEN v.custom_entry END
  ORDER BY count(*) DESC;
$$;

-- Tallies are public by nature: they are the leaderboard the app displays.
GRANT EXECUTE ON FUNCTION public.voting_category_tallies() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voting_results(uuid) TO anon, authenticated;
