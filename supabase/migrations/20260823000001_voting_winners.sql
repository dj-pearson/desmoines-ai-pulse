-- WEB-SEC-025 step 2: the last read of raw ballots that had no aggregate.
--
-- Android's fetchWinners() selected (entity_id, category_id) for EVERY vote in
-- the table and picked the per-category top entity in Kotlin. That is the
-- widest of the three raw reads -- it is not scoped to a category, so it pulls
-- every ballot ever cast -- and votes carries user_id under a
-- "Public read votes" SELECT policy with USING (true).
--
-- voting_category_tallies() and voting_results(uuid) (migration 20260822000013)
-- covered the other two reads. This covers the third, so no client needs the
-- raw table for anything but its own row and its own insert, which is what
-- step 3 has to be true before it can replace the policy.
--
-- Additive only: new function, no signature changed, no policy touched.

/**
 * Top entity per ACTIVE voting category, with the category's name.
 *
 * Write-ins are excluded because there is nothing to badge -- the caller maps
 * the winning entity id to "Best {category}" for award badges on entity cards,
 * and a custom_entry has no entity to attach that to. This mirrors what the
 * Kotlin did rather than quietly changing the product behaviour.
 *
 * Ties resolve by entity_id, deterministically. maxByOrNull in Kotlin resolved
 * them by whichever key the grouping happened to yield first, which was not
 * stable across calls; picking a rule and stating it is better than inheriting
 * an accident.
 *
 * Returns no user_id and no vote ids.
 */
CREATE OR REPLACE FUNCTION public.voting_winners()
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
  SELECT DISTINCT ON (t.category_id)
    t.category_id,
    t.category_name,
    t.entity_id,
    t.vote_count
  FROM (
    SELECT
      v.category_id,
      c.name AS category_name,
      v.entity_id,
      count(*)::bigint AS vote_count
    FROM public.votes v
    JOIN public.voting_categories c ON c.id = v.category_id
    WHERE v.entity_id IS NOT NULL
      AND c.is_active = true
    GROUP BY v.category_id, c.name, v.entity_id
  ) t
  ORDER BY t.category_id, t.vote_count DESC, t.entity_id;
$$;

-- The leaderboard and its winners are public by nature; the ballots are not.
GRANT EXECUTE ON FUNCTION public.voting_winners() TO anon, authenticated;

COMMENT ON FUNCTION public.voting_winners() IS
  'Top entity per active voting category (WEB-SEC-025). Aggregate only - no user_id, no vote ids.';
