-- Plan & Stay pass 2, WP5 item 1: let a voter change their own vote.
--
-- votes has a unique index on (category_id, user_id). Web (useVoting.ts
-- useCastVote) and Android (BestOfRemoteDataSource.kt) both cast with
-- upsert(onConflict = "category_id,user_id"), which PostgREST turns into
-- INSERT ... ON CONFLICT DO UPDATE. That needs an UPDATE policy, and votes has
-- only INSERT, SELECT and DELETE ones (docs/RLS_AUDIT.md), so the first vote in
-- a category works and every change fails with 42501.
--
-- This is the UPDATE half of 20260829000001_votes_ballot_privacy.sql, split
-- out on its own. That migration also tightens SELECT on votes, which is a
-- separate decision held for the owner (plan-stay-pass2.md D14). This file
-- only loosens access: a voter may update a row that is already theirs, and
-- may not move it to anyone else. Safe in a single release.
--
-- Idempotent with 20260829000001: whichever applies second drops and
-- recreates the same policy.
--
-- Once applied, flip VOTE_CHANGE_AVAILABLE in src/lib/votingStatus.ts.

DROP POLICY IF EXISTS "Users can update own votes" ON public.votes;
CREATE POLICY "Users can update own votes"
  ON public.votes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
