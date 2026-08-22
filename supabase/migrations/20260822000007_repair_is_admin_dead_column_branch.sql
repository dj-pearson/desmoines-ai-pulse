-- Repair public.is_admin(), which THROWS for every non-admin caller.
--
-- Found while adding the media_assets read policy in 20260822000006. That
-- policy uses is_admin(), matching the "Admins can manage all media" policy
-- already on the table -- and a non-admin SELECT immediately failed with
--   ERROR:  column "role" does not exist
--   CONTEXT: PL/pgSQL function is_admin() line 24 at IF
--
-- The function tries three gates in order:
--   1. user_roles.role                     exists, works
--   2. profiles.user_role                  exists, works
--   3. profiles.role  "for backwards compatibility"   DOES NOT EXIST
-- Branch 3 is only reached when 1 and 2 both return false -- that is, for
-- exactly the callers who are NOT admins. An admin returns true at branch 1 and
-- never touches it. So the function works perfectly for the people who test it
-- and raises a 500 for everyone else, which is why it has survived.
--
-- profiles has id, user_id and user_role. It has no `role` column, and the
-- comment above branch 3 claiming the column is write-guarded by
-- validate_profile_user_id() (WEB-DB-002) describes a column that is not there.
--
-- BLAST RADIUS, measured rather than estimated. 61 policies across 52 tables
-- call is_admin(); all 52 are scoped to authenticated or public, so a logged-in
-- non-admin can reach them. Executing count(*) on each as a non-admin
-- authenticated user, 11 raise the error instead of returning rows:
--   ai_model_configurations, gsc_keyword_performance, gsc_oauth_credentials,
--   gsc_page_performance, gsc_properties, media_assets, oauth_providers,
--   support_canned_responses, support_kb, trending_config, user_roles
-- The other 41 survive on an accident of evaluation order: Postgres ORs
-- permissive policies and short-circuits, so a table with another permissive
-- policy that matches first never calls is_admin() at all. Add a row, drop a
-- policy or reorder one and a table moves between those groups silently.
-- user_roles is the one to notice -- it backs role lookup itself.
--
-- SAFE IN ONE RELEASE. This only ever changes a THROW into FALSE. Branch 3
-- cannot currently return true, since it cannot execute; removing it grants
-- nothing to anyone and denies nothing to an admin, who is already matched by
-- branch 1 or 2.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Canonical source of truth.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Legacy fallback for rows that still carry the role on the profile.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND user_role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- The third branch checked profiles.role, a column this database has never
  -- had. It is removed rather than corrected: profiles.user_role above is the
  -- same check against the column that actually exists.
  RETURN FALSE;
END;
$$;
