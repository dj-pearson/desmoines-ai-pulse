-- Account plan WP5 item 4 (applying it is deferred D3): the weekly digest's
-- recipient list reads columns that exist.
--
-- get_weekly_digest_recipients (20251110000005_add_weekly_email_digest.sql:69-105)
-- has never been able to return a row:
--   * it joins `profiles p ON p.id = uep.user_id`, but user_email_preferences.user_id
--     is the auth user id, which is profiles.user_id, not profiles.id;
--   * it selects p.home_latitude and p.home_longitude and filters on
--     p.email_verified, none of which are profiles columns in
--     scripts/db-snapshot.json (2026-08-24).
-- plpgsql resolves those names at first execution, so the migration applied
-- cleanly and every call since has failed with 42703. The Settings page
-- described a Sunday email this function could not produce.
--
-- What changes:
--   * join on p.user_id;
--   * "verified" means auth.users.email_confirmed_at IS NOT NULL, the only
--     place that is recorded;
--   * the address comes from auth.users, the one a confirmed email change
--     updates (profiles.email did not follow it; see 20260926000004);
--   * home_latitude / home_longitude stay in the RETURNS TABLE, as NULL, so the
--     function's shape is unchanged for send-weekly-digest's Recipient type.
--     They are declared REAL there, so the NULLs are cast to real: CREATE OR
--     REPLACE cannot change a return type, and RETURN QUERY rejects a column
--     whose type does not match.
--
-- SECURITY: THIS FUNCTION NOW RETURNS EMAIL ADDRESSES, so its EXECUTE grant
-- matters. Postgres grants EXECUTE on a new function to PUBLIC, and
-- 20251110000005 only added service_role on top, so anon and authenticated
-- could call it through PostgREST. Nobody noticed because it always failed.
-- Its only caller is the send-weekly-digest edge function with the service
-- role key; no web, iOS or Android code calls it (grep for
-- get_weekly_digest_recipients in src/, ios/, android/ finds nothing). So
-- revoking from PUBLIC, anon and authenticated removes access no client uses,
-- the same reasoning as 20260711000030.
--
-- Additive otherwise: same name, no arguments, same return columns.

CREATE OR REPLACE FUNCTION public.get_weekly_digest_recipients()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  categories_filter TEXT[],
  max_distance_miles INTEGER,
  home_latitude REAL,
  home_longitude REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uep.user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    uep.categories_filter,
    uep.max_distance_miles,
    NULL::real AS home_latitude,
    NULL::real AS home_longitude
  FROM public.user_email_preferences uep
  JOIN auth.users u ON u.id = uep.user_id
  LEFT JOIN public.profiles p ON p.user_id = uep.user_id
  WHERE uep.weekly_digest_enabled = true
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    -- Don't send if already sent in last 6 days
    AND NOT EXISTS (
      SELECT 1
      FROM public.weekly_digest_log wdl
      WHERE wdl.user_id = uep.user_id
        AND wdl.sent_at > NOW() - INTERVAL '6 days'
    );
END;
$$;

COMMENT ON FUNCTION public.get_weekly_digest_recipients() IS
'Account plan WP5 item 4. Users with weekly_digest_enabled and a confirmed auth email, not sent in the last 6 days. home_latitude/home_longitude are always NULL (profiles has no such columns) and are kept only so the return shape does not change. Service role only.';

REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM anon;
REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_recipients() TO service_role;
