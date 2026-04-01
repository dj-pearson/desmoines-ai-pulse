-- ============================================================================
-- CPM Pricing: add cpm_rate to ad_rate_card, pricing tracking to
-- campaign_placements, and a public RPC for platform advertising metrics.
-- ============================================================================

-- 1. Add cpm_rate column to ad_rate_card
ALTER TABLE ad_rate_card
  ADD COLUMN IF NOT EXISTS cpm_rate NUMERIC(8,2) DEFAULT 10.00;

-- 2. Expand the placement_type constraint to cover sidebar + sponsored_listing
ALTER TABLE ad_rate_card
  DROP CONSTRAINT IF EXISTS ad_rate_card_placement_type_check;

ALTER TABLE ad_rate_card
  ADD CONSTRAINT ad_rate_card_placement_type_check
  CHECK (placement_type IN (
    'top_banner', 'featured_spot', 'below_fold', 'sidebar', 'sponsored_listing'
  ));

-- 3. Set CPM rates for existing placement types
UPDATE ad_rate_card SET cpm_rate = 12.00 WHERE placement_type = 'top_banner';
UPDATE ad_rate_card SET cpm_rate = 10.00 WHERE placement_type = 'featured_spot';
UPDATE ad_rate_card SET cpm_rate = 8.00  WHERE placement_type = 'below_fold';

-- 4. Add sidebar and sponsored_listing rows if not already present
INSERT INTO ad_rate_card (
  placement_type, base_daily_rate, min_days, max_days,
  min_lead_time_days, discount_7_day, discount_14_day, discount_30_day, cpm_rate
) VALUES
  ('sidebar',            5.00, 1, 365, 3, 5.00, 10.00, 15.00,  8.00),
  ('sponsored_listing', 15.00, 1, 365, 3, 5.00, 10.00, 15.00, 15.00)
ON CONFLICT (placement_type) DO UPDATE
  SET cpm_rate = EXCLUDED.cpm_rate;

-- 5. Add pricing metadata columns to campaign_placements
ALTER TABLE campaign_placements
  ADD COLUMN IF NOT EXISTS pricing_model TEXT DEFAULT 'flat'
    CHECK (pricing_model IN ('flat', 'cpm')),
  ADD COLUMN IF NOT EXISTS estimated_daily_impressions INT;

-- 6. Public RPC returning aggregated platform metrics from GSC data.
--    SECURITY DEFINER so anon/unauthenticated advertisers can call it without
--    needing direct access to gsc_keyword_performance.
CREATE OR REPLACE FUNCTION get_platform_advertising_metrics()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'monthly_impressions', COALESCE(SUM(k.impressions), 0),
    'monthly_clicks',      COALESCE(SUM(k.clicks), 0),
    'avg_ctr',             ROUND(COALESCE(AVG(k.ctr), 0)::numeric, 2),
    'data_days',           COUNT(DISTINCT k.date)
  )
  FROM gsc_keyword_performance k
  WHERE k.date >= CURRENT_DATE - INTERVAL '30 days';
$$;

GRANT EXECUTE ON FUNCTION get_platform_advertising_metrics() TO anon, authenticated;
