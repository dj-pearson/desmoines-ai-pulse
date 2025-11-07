-- Daily Analytics Aggregation Job
-- This migration sets up a scheduled job to aggregate ad analytics daily

-- ============================================================
-- AGGREGATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.aggregate_daily_ad_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yesterday DATE;
  v_rows_inserted INTEGER;
BEGIN
  -- Get yesterday's date
  v_yesterday := CURRENT_DATE - INTERVAL '1 day';

  -- Log start of aggregation
  RAISE NOTICE 'Starting daily ad analytics aggregation for date: %', v_yesterday;

  -- Aggregate impressions and clicks by campaign and creative
  INSERT INTO public.campaign_analytics_daily (
    campaign_id,
    creative_id,
    date,
    impressions,
    clicks,
    ctr,
    cost,
    unique_viewers,
    created_at,
    updated_at
  )
  SELECT
    imp.campaign_id,
    imp.creative_id,
    imp.date,
    COUNT(DISTINCT imp.id) as impressions,
    COALESCE(click_counts.click_count, 0) as clicks,
    CASE
      WHEN COUNT(DISTINCT imp.id) > 0
      THEN (COALESCE(click_counts.click_count, 0)::DECIMAL / COUNT(DISTINCT imp.id)::DECIMAL) * 100
      ELSE 0
    END as ctr,
    COALESCE(placement_costs.daily_cost, 0) as cost,
    COUNT(DISTINCT imp.session_id) as unique_viewers,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.ad_impressions imp
  LEFT JOIN (
    -- Count clicks for each campaign/creative/date
    SELECT
      campaign_id,
      creative_id,
      date,
      COUNT(*) as click_count
    FROM public.ad_clicks
    WHERE date = v_yesterday
    GROUP BY campaign_id, creative_id, date
  ) click_counts ON
    click_counts.campaign_id = imp.campaign_id AND
    click_counts.creative_id = imp.creative_id AND
    click_counts.date = imp.date
  LEFT JOIN (
    -- Get daily cost from campaign placements
    SELECT DISTINCT ON (cp.campaign_id, cc.id)
      cp.campaign_id,
      cc.id as creative_id,
      cp.daily_cost
    FROM public.campaign_placements cp
    JOIN public.campaign_creatives cc ON cc.campaign_id = cp.campaign_id AND cc.placement_type = cp.placement_type
  ) placement_costs ON
    placement_costs.campaign_id = imp.campaign_id AND
    placement_costs.creative_id = imp.creative_id
  WHERE imp.date = v_yesterday
  GROUP BY
    imp.campaign_id,
    imp.creative_id,
    imp.date,
    click_counts.click_count,
    placement_costs.daily_cost
  ON CONFLICT (campaign_id, creative_id, date)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    ctr = EXCLUDED.ctr,
    cost = EXCLUDED.cost,
    unique_viewers = EXCLUDED.unique_viewers,
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- Log completion
  RAISE NOTICE 'Daily ad analytics aggregation completed. Rows affected: %', v_rows_inserted;

  -- Clean up old impression/click data (optional - keep 90 days)
  -- Uncomment if you want to automatically clean up old tracking data
  /*
  DELETE FROM public.ad_impressions
  WHERE date < CURRENT_DATE - INTERVAL '90 days';

  DELETE FROM public.ad_clicks
  WHERE date < CURRENT_DATE - INTERVAL '90 days';
  */

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in aggregate_daily_ad_analytics: % %', SQLERRM, SQLSTATE;
END;
$$;

-- ============================================================
-- MANUAL AGGREGATION FUNCTION (with date parameter)
-- ============================================================

CREATE OR REPLACE FUNCTION public.aggregate_ad_analytics_for_date(p_date DATE)
RETURNS TABLE (
  rows_affected INTEGER,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_inserted INTEGER;
BEGIN
  -- Aggregate impressions and clicks for specified date
  INSERT INTO public.campaign_analytics_daily (
    campaign_id,
    creative_id,
    date,
    impressions,
    clicks,
    ctr,
    cost,
    unique_viewers,
    created_at,
    updated_at
  )
  SELECT
    imp.campaign_id,
    imp.creative_id,
    imp.date,
    COUNT(DISTINCT imp.id) as impressions,
    COALESCE(click_counts.click_count, 0) as clicks,
    CASE
      WHEN COUNT(DISTINCT imp.id) > 0
      THEN (COALESCE(click_counts.click_count, 0)::DECIMAL / COUNT(DISTINCT imp.id)::DECIMAL) * 100
      ELSE 0
    END as ctr,
    COALESCE(placement_costs.daily_cost, 0) as cost,
    COUNT(DISTINCT imp.session_id) as unique_viewers,
    NOW() as created_at,
    NOW() as updated_at
  FROM public.ad_impressions imp
  LEFT JOIN (
    SELECT
      campaign_id,
      creative_id,
      date,
      COUNT(*) as click_count
    FROM public.ad_clicks
    WHERE date = p_date
    GROUP BY campaign_id, creative_id, date
  ) click_counts ON
    click_counts.campaign_id = imp.campaign_id AND
    click_counts.creative_id = imp.creative_id AND
    click_counts.date = imp.date
  LEFT JOIN (
    SELECT DISTINCT ON (cp.campaign_id, cc.id)
      cp.campaign_id,
      cc.id as creative_id,
      cp.daily_cost
    FROM public.campaign_placements cp
    JOIN public.campaign_creatives cc ON cc.campaign_id = cp.campaign_id AND cc.placement_type = cp.placement_type
  ) placement_costs ON
    placement_costs.campaign_id = imp.campaign_id AND
    placement_costs.creative_id = imp.creative_id
  WHERE imp.date = p_date
  GROUP BY
    imp.campaign_id,
    imp.creative_id,
    imp.date,
    click_counts.click_count,
    placement_costs.daily_cost
  ON CONFLICT (campaign_id, creative_id, date)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    ctr = EXCLUDED.ctr,
    cost = EXCLUDED.cost,
    unique_viewers = EXCLUDED.unique_viewers,
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  RETURN QUERY SELECT
    v_rows_inserted,
    true,
    format('Successfully aggregated analytics for %s. Rows affected: %s', p_date, v_rows_inserted);

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      0,
      false,
      format('Error aggregating analytics: %s', SQLERRM);
END;
$$;

-- ============================================================
-- BACKFILL FUNCTION (for historical data)
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_ad_analytics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  rows_affected INTEGER,
  success BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_date DATE;
  v_result RECORD;
BEGIN
  v_current_date := p_start_date;

  WHILE v_current_date <= p_end_date LOOP
    -- Aggregate for current date
    SELECT * INTO v_result
    FROM public.aggregate_ad_analytics_for_date(v_current_date);

    RETURN QUERY SELECT
      v_current_date,
      v_result.rows_affected,
      v_result.success;

    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- ============================================================
-- SCHEDULE THE JOB (using pg_cron if available)
-- ============================================================

-- Note: This requires the pg_cron extension to be enabled
-- Run this separately if pg_cron is available:
/*
-- Enable pg_cron extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the aggregation job to run daily at 1 AM UTC
SELECT cron.schedule(
  'aggregate-daily-ad-analytics',
  '0 1 * * *', -- Every day at 1 AM
  'SELECT public.aggregate_daily_ad_analytics();'
);
*/

-- Alternative: If pg_cron is not available, you can call this function
-- from your application or use Supabase Edge Functions with a cron trigger

-- ============================================================
-- HELPER FUNCTION: Get Analytics Summary
-- ============================================================

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
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(impressions), 0)::BIGINT as total_impressions,
    COALESCE(SUM(clicks), 0)::BIGINT as total_clicks,
    CASE
      WHEN COALESCE(SUM(impressions), 0) > 0
      THEN ROUND((COALESCE(SUM(clicks), 0)::DECIMAL / COALESCE(SUM(impressions), 0)::DECIMAL) * 100, 2)
      ELSE 0::DECIMAL
    END as avg_ctr,
    COALESCE(SUM(cost), 0) as total_cost,
    COALESCE(SUM(unique_viewers), 0)::BIGINT as unique_viewers,
    COUNT(DISTINCT date)::INTEGER as days_active
  FROM public.campaign_analytics_daily
  WHERE campaign_id = p_campaign_id
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date);
END;
$$;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON FUNCTION public.aggregate_daily_ad_analytics IS 'Aggregates ad impressions and clicks into daily analytics. Run daily via cron or scheduler.';
COMMENT ON FUNCTION public.aggregate_ad_analytics_for_date IS 'Manually aggregate analytics for a specific date. Useful for backfilling or reprocessing.';
COMMENT ON FUNCTION public.backfill_ad_analytics IS 'Backfill analytics data for a date range. Useful for historical data processing.';
COMMENT ON FUNCTION public.get_campaign_analytics_summary IS 'Get aggregated analytics summary for a campaign within a date range.';
