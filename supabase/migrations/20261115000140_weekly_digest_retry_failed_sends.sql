-- WEB-ADS-038: a failed weekly digest send no longer blocks a retry for 6 days.
--
-- send-weekly-digest writes a weekly_digest_log row for every attempt:
-- email_status 'sent' on success, 'failed' when the content RPC, the
-- newsletter_subscribers read or the SES send throws. get_weekly_digest_recipients
-- (20260926000003) excluded a user on ANY row in the last 6 days, so a send
-- SES throttled (the function used to fire every recipient at once) counted as
-- "already had this week's digest" and a same-week re-run skipped them.
--
-- The only change is `AND wdl.email_status = 'sent'` in the NOT EXISTS. Same
-- name, no arguments, same return columns, same grants: the function returns
-- more rows than before, never fewer, and its only caller is
-- send-weekly-digest with the service role key.

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
    -- Don't send if a digest was delivered in the last 6 days. A 'failed'
    -- row does not count: that user did not get this week's digest.
    AND NOT EXISTS (
      SELECT 1
      FROM public.weekly_digest_log wdl
      WHERE wdl.user_id = uep.user_id
        AND wdl.email_status = 'sent'
        AND wdl.sent_at > NOW() - INTERVAL '6 days'
    );
END;
$$;

COMMENT ON FUNCTION public.get_weekly_digest_recipients() IS
'Account plan WP5 item 4; WEB-ADS-038. Users with weekly_digest_enabled and a confirmed auth email, with no successful (email_status = sent) digest in the last 6 days; a failed attempt does not block a retry. home_latitude/home_longitude are always NULL (profiles has no such columns) and are kept only so the return shape does not change. Service role only.';

REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM anon;
REVOKE ALL ON FUNCTION public.get_weekly_digest_recipients() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_digest_recipients() TO service_role;
