-- Campaign delivery numbers, counted in the database and only for the owner
-- (business plan WP4 item 5).
--
-- 1. get_campaign_analytics_summary (20251107000002) is SECURITY DEFINER with
--    no owner check and no search_path, and EXECUTE was never revoked from
--    PUBLIC, so anyone holding the anon key could read any campaign's totals
--    by id. Re-created with the same signature and the same return columns;
--    the body is 20251107000002's, behind a guard. Tightening: anon loses
--    EXECUTE. Nothing in src calls it; check the iOS and Android apps before
--    applying (plan D7).
--
-- 2. get_campaign_delivery: per day and creative, impressions and clicks,
--    GROUPed here. useCampaignAnalytics counted raw ad_impressions rows in the
--    browser, so a campaign past PostgREST's row cap under-reported exactly
--    the thing the advertiser paid for.
--
-- 3. get_placement_delivery: per placement, what was actually served over the
--    last 30 days and on how many days. Aggregate only, no campaign, creative
--    or visitor in it, so it is granted to anon: /advertise shows it (above
--    PlatformMetrics' MIN_DATA_DAYS floor) instead of an audience claim.
--
-- Additive except the anon revoke in 1. Apply is deferred (plan D7).

-- ---------------------------------------------------------------------------
-- 1. get_campaign_analytics_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_analytics_summary(
  p_campaign_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_impressions BIGINT,
  total_clicks BIGINT,
  avg_ctr DECIMAL,
  total_cost DECIMAL,
  unique_viewers BIGINT,
  days_active INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (
       coalesce(auth.role(), '') = 'service_role'
    OR public.is_admin()
    OR EXISTS (
         SELECT 1 FROM public.campaigns c
          WHERE c.id = p_campaign_id
            AND auth.uid() IS NOT NULL
            AND c.user_id = auth.uid()
       )
  ) THEN
    RAISE EXCEPTION 'get_campaign_analytics_summary: not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.impressions), 0)::BIGINT,
    COALESCE(SUM(d.clicks), 0)::BIGINT,
    CASE
      WHEN COALESCE(SUM(d.impressions), 0) > 0
      THEN ROUND((COALESCE(SUM(d.clicks), 0)::DECIMAL / COALESCE(SUM(d.impressions), 0)::DECIMAL) * 100, 2)
      ELSE 0::DECIMAL
    END,
    COALESCE(SUM(d.cost), 0)::DECIMAL,
    COALESCE(SUM(d.unique_viewers), 0)::BIGINT,
    COUNT(DISTINCT d.date)::INTEGER
  FROM public.campaign_analytics_daily d
  WHERE d.campaign_id = p_campaign_id
    AND (p_start_date IS NULL OR d.date >= p_start_date)
    AND (p_end_date IS NULL OR d.date <= p_end_date);
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_analytics_summary(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_analytics_summary(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_analytics_summary(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_campaign_analytics_summary(uuid, date, date) IS
'Aggregated daily analytics for one campaign. Owner, admin or service role only (42501 otherwise). Business plan WP4 item 5.';

-- ---------------------------------------------------------------------------
-- 2. get_campaign_delivery
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_delivery(
  p_campaign_id uuid,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  date date,
  creative_id uuid,
  impressions bigint,
  clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (
       coalesce(auth.role(), '') = 'service_role'
    OR public.is_admin()
    OR EXISTS (
         SELECT 1 FROM public.campaigns c
          WHERE c.id = p_campaign_id
            AND auth.uid() IS NOT NULL
            AND c.user_id = auth.uid()
       )
  ) THEN
    RAISE EXCEPTION 'get_campaign_delivery: not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH imp AS (
    SELECT i.date AS day, i.creative_id AS creative, count(*)::bigint AS n
      FROM public.ad_impressions i
     WHERE i.campaign_id = p_campaign_id
       AND (p_start IS NULL OR i.date >= p_start)
       AND (p_end IS NULL OR i.date <= p_end)
     GROUP BY i.date, i.creative_id
  ),
  clk AS (
    SELECT k.date AS day, k.creative_id AS creative, count(*)::bigint AS n
      FROM public.ad_clicks k
     WHERE k.campaign_id = p_campaign_id
       AND (p_start IS NULL OR k.date >= p_start)
       AND (p_end IS NULL OR k.date <= p_end)
     GROUP BY k.date, k.creative_id
  )
  SELECT
    COALESCE(imp.day, clk.day)::date,
    COALESCE(imp.creative, clk.creative),
    COALESCE(imp.n, 0),
    COALESCE(clk.n, 0)
  FROM imp
  FULL OUTER JOIN clk
    ON clk.day = imp.day
   AND clk.creative IS NOT DISTINCT FROM imp.creative
  ORDER BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_delivery(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_delivery(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_delivery(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_campaign_delivery(uuid, date, date) IS
'Impressions and clicks per day and creative for one campaign, counted in the database so no row cap applies. Owner, admin or service role only (42501 otherwise). Business plan WP4 item 5.';

-- ---------------------------------------------------------------------------
-- 3. get_placement_delivery
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_placement_delivery()
RETURNS TABLE (
  placement_type text,
  impressions bigint,
  clicks bigint,
  days_with_data integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH imp AS (
    SELECT i.placement_type::text AS placement,
           count(*)::bigint AS n,
           count(DISTINCT i.date)::integer AS days
      FROM public.ad_impressions i
     WHERE i.date >= current_date - 29
       AND i.placement_type IS NOT NULL
     GROUP BY 1
  ),
  clk AS (
    SELECT cc.placement_type::text AS placement,
           count(*)::bigint AS n
      FROM public.ad_clicks k
      JOIN public.campaign_creatives cc ON cc.id = k.creative_id
     WHERE k.date >= current_date - 29
     GROUP BY 1
  )
  SELECT
    COALESCE(imp.placement, clk.placement),
    COALESCE(imp.n, 0),
    COALESCE(clk.n, 0),
    COALESCE(imp.days, 0)
  FROM imp
  FULL OUTER JOIN clk ON clk.placement = imp.placement
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_placement_delivery() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_placement_delivery() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_placement_delivery() IS
'Per placement, impressions and clicks served over the last 30 days and the number of days with any impression. Aggregate only; public. Business plan WP4 item 5.';
