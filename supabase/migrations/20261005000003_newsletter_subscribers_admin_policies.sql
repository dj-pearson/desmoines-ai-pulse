-- Non-core review WP5 (admin): let admins read and update newsletter
-- subscribers.
--
-- The only admin policy on newsletter_subscribers (20251126000000) tests
-- profiles.role = 'admin' against profiles.id. profiles has no role column
-- (the column is user_role, keyed by user_id; see 20260822000007), so that
-- policy cannot match, and no migration creates an UPDATE policy at all. An
-- admin's list read returns no rows, and a status change from the admin page
-- updates zero rows without an error, which the page reported as success.
--
-- Both policies below are permissive and use public.is_admin(), the same
-- check every other admin policy uses (user_roles admin/root_admin, with the
-- profiles.user_role fallback). They only add access. The broken policy is
-- left in place; removing it grants and denies nothing, and can go with the
-- next cleanup.
--
-- confirm_token stays column-revoked from authenticated (20260918000002), so
-- an admin select that names it still fails; the admin page does not.

DROP POLICY IF EXISTS "newsletter_subscribers_admin_select" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_subscribers_admin_select"
  ON public.newsletter_subscribers
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "newsletter_subscribers_admin_update" ON public.newsletter_subscribers;
CREATE POLICY "newsletter_subscribers_admin_update"
  ON public.newsletter_subscribers
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
