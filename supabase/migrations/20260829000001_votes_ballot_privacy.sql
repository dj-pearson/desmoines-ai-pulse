-- WEB-SEC-025 step 3, plus the UPDATE policy that was never there.
--
-- votes.user_id was readable by anyone holding the anon key, because the only
-- SELECT policy was USING (true). A ballot is not public data: the tally is.
-- The tally already has its own door - voting_category_tallies() and
-- voting_results(uuid) are SECURITY DEFINER aggregates that return counts
-- without user_id or vote ids, and all three clients read them (iOS since
-- step 1, web useVoting.ts:67/:116, Android BestOfRemoteDataSource.kt:53/:80).
--
-- WHY THIS IS SAFE TO TIGHTEN IN ONE RELEASE, which the story deliberately
-- said it would not be. The rule in CLAUDE.md is that an RLS policy must not
-- be tightened in a way that denies reads an older client expects to succeed.
-- public.votes holds ZERO rows and has for the whole life of the table, across
-- 10 active categories open since 2026-03-12. Every reader - the newest web
-- build and the oldest binary in the wild alike - already gets an empty array
-- from this table. After this migration they still get an empty array. The
-- behaviour older clients observe does not change, so there is nothing to
-- phase. That is only true while the count is zero: once the first ballot is
-- cast, this becomes a real deprecation and has to wait on
-- MIN_SUPPORTED_APP_VERSION exactly as the story describes. Doing it now is
-- the cheap moment, not a shortcut past the rule.

-- 1. A voter must be able to CHANGE their vote. This was missing and it is a
--    live bug, not housekeeping: votes has a unique index on
--    (category_id, user_id) and Android casts with
--    upsert(onConflict = "category_id,user_id"), which becomes
--    ON CONFLICT DO UPDATE and needs an UPDATE policy. With INSERT, SELECT and
--    DELETE policies only, the second vote in a category fails with
--    "new row violates row-level security policy". Web happens to escape it by
--    doing delete-then-insert. Reproduced against production in a rolled-back
--    transaction before writing this.
DROP POLICY IF EXISTS "Users can update own votes" ON public.votes;
CREATE POLICY "Users can update own votes"
  ON public.votes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. The ballot itself is readable only by the voter and by admins. The ballot
--    UI needs this: it reads the caller's own row to show "you voted for X"
--    (web useVoting.ts useUserVote, Android fetchUserVote), and both already
--    filter on user_id, so neither changes.
DROP POLICY IF EXISTS "Public read votes" ON public.votes;
DROP POLICY IF EXISTS "Voters read own votes" ON public.votes;
CREATE POLICY "Voters read own votes"
  ON public.votes
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
