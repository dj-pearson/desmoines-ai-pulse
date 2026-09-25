-- Account plan WP4 items 1 and 2: an organizer's Delete and Edit do what the
-- buttons say.
--
-- What production has (20250128000000_user_submitted_events.sql:33-48,
-- docs/RLS_AUDIT.md "user_submitted_events"):
--   * no DELETE policy for the owner, so the dashboard's trash button deleted
--     zero rows, got no error, and toasted "Event deleted successfully";
--   * an owner UPDATE policy of `auth.uid() = user_id AND status = 'pending'`,
--     so Edit on a `needs_revision` row - the one state that asks for an edit -
--     also matched zero rows.
--
-- LOOSENING ONLY. Both changes widen what the owner may do; nothing an older
-- iOS/Android binary or the web client does today stops working (CLAUDE.md,
-- Backward Compatibility). The replaced UPDATE policy had no WITH CHECK, which
-- Postgres reads as WITH CHECK = USING, i.e. `status = 'pending'` after the
-- write. The new WITH CHECK keeps exactly that, so an owner still cannot move
-- their own row to `approved`: every edit goes back to the review queue.
--
-- After applying (Deferred D1): as the owner, PATCH a `needs_revision` row with
-- status 'pending' and DELETE a `rejected` row, both with
-- `Prefer: return=representation`, and expect the row back each time. Then set
-- SUBMISSION_OWNER_DELETE_ENABLED in src/lib/submissionActions.ts to true.

-- Edit a submission that is waiting for review or was sent back for changes.
DROP POLICY IF EXISTS "Users can update own pending or returned submissions" ON public.user_submitted_events;
CREATE POLICY "Users can update own pending or returned submissions"
  ON public.user_submitted_events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending', 'needs_revision'))
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- The policy above is a superset of this one. Dropped in the same transaction
-- as its replacement is created, so there is no moment with neither.
DROP POLICY IF EXISTS "Users can update own pending submissions" ON public.user_submitted_events;

-- Delete a submission that has not been approved. An approved one may have a
-- live listing pointing back at it (events.submission_id), so it stays.
DROP POLICY IF EXISTS "Users can delete own unapproved submissions" ON public.user_submitted_events;
CREATE POLICY "Users can delete own unapproved submissions"
  ON public.user_submitted_events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending', 'needs_revision', 'rejected'));
