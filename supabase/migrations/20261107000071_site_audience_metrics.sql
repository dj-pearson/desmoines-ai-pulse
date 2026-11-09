-- WEB-ADS-012 AC2: site visits and page views for /advertise.
--
-- get_platform_advertising_metrics (20260401000001) sums Google Search Console
-- impressions and clicks. Those describe how often our pages appear in Google
-- results, not how many people use the site, and they are the only reach
-- figures /advertise has ever had. An advertiser buying a banner wants the
-- second number.
--
-- WHERE THE NUMBERS COME FROM. user_analytics rows with event_type =
-- 'page_view', written by usePageTracking on every route change. Only visitors
-- who accepted analytics cookies are recorded, so both figures are floors and
-- the page says so. Nothing is estimated.
--
--   monthly_page_views  count of page_view rows in the last 30 days
--   monthly_visits      distinct session_id across those rows
--   data_days           distinct calendar days (America/Chicago) with any
--
-- WHY A FUNCTION. user_analytics is admin-read only (20251110000011) and holds
-- user_agent, ip_address and user_id; anon must never read a row of it. This
-- function returns three integers and nothing else, which is the whole grant.
--
-- The minimum-sample rule (7 days, non-zero) lives in the client next to the
-- GSC block's identical rule, so the two cannot drift apart.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md): one new function and one new index.
-- get_platform_advertising_metrics is untouched, and the client keeps calling
-- it as a fallback until this has been applied.

-- The function reads page_view rows by date. The existing (event_type) index
-- would walk every page view ever recorded on each /advertise load.
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_user_analytics_event_type_created_at
  ON public.user_analytics (event_type, created_at);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Skipping user_analytics index: table does not exist';
END $$;

CREATE OR REPLACE FUNCTION public.get_site_audience_metrics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT json_build_object(
    'monthly_page_views', COUNT(*),
    'monthly_visits',     COUNT(DISTINCT a.session_id),
    'data_days',          COUNT(DISTINCT (a.created_at AT TIME ZONE 'America/Chicago')::date)
  )
  FROM public.user_analytics a
  WHERE a.event_type = 'page_view'
    AND a.created_at >= now() - INTERVAL '30 days';
$$;

COMMENT ON FUNCTION public.get_site_audience_metrics() IS
  'WEB-ADS-012: 30-day page views, distinct sessions and days with data from user_analytics page_view rows (analytics-consented visitors only). Aggregates only; no row leaves the function.';

REVOKE ALL ON FUNCTION public.get_site_audience_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_audience_metrics() TO anon, authenticated;
