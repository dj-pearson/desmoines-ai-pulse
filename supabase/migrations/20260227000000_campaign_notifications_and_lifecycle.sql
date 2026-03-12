-- Campaign Notifications table for tracking all campaign lifecycle notifications
CREATE TABLE IF NOT EXISTS campaign_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'campaign_created',
    'payment_received',
    'creative_uploaded',
    'creative_approved',
    'creative_rejected',
    'campaign_activated',
    'campaign_expiring_soon',
    'campaign_completed',
    'campaign_rejected',
    'campaign_refunded',
    'creative_deadline_warning'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_recipient ON campaign_notifications(recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_campaign ON campaign_notifications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_type ON campaign_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_created ON campaign_notifications(created_at DESC);

-- RLS policies
ALTER TABLE campaign_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
DO $$ BEGIN
  CREATE POLICY "Users can read own notifications" ON campaign_notifications
    FOR SELECT USING (auth.uid() = recipient_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can mark their own notifications as read
DO $$ BEGIN
  CREATE POLICY "Users can update own notifications" ON campaign_notifications
    FOR UPDATE USING (auth.uid() = recipient_user_id)
    WITH CHECK (auth.uid() = recipient_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can manage all notifications
DO $$ BEGIN
  CREATE POLICY "Service role manages notifications" ON campaign_notifications
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- Campaign Lifecycle Management Function
-- Called by pg_cron or manually to manage campaign state transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION process_campaign_lifecycle()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  activated_count INT := 0;
  completed_count INT := 0;
  expiring_count INT := 0;
  deadline_count INT := 0;
  result JSON;
BEGIN
  -- 1. ACTIVATE campaigns that are approved and reached their start date
  -- Campaign must have status 'pending_review' or 'pending_creative' with all creatives approved
  WITH campaigns_to_activate AS (
    SELECT c.id, c.name, c.user_id
    FROM campaigns c
    WHERE c.status IN ('pending_review', 'pending_creative')
      AND c.start_date <= CURRENT_DATE
      AND EXISTS (
        SELECT 1 FROM campaign_creatives cc
        WHERE cc.campaign_id = c.id AND cc.is_approved = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM campaign_creatives cc
        WHERE cc.campaign_id = c.id AND cc.is_approved = false
      )
  ),
  updated_active AS (
    UPDATE campaigns
    SET status = 'active', updated_at = now()
    WHERE id IN (SELECT id FROM campaigns_to_activate)
    RETURNING id
  )
  SELECT COUNT(*) INTO activated_count FROM updated_active;

  -- 2. COMPLETE campaigns that have passed their end date
  WITH campaigns_to_complete AS (
    SELECT c.id, c.name, c.user_id
    FROM campaigns c
    WHERE c.status = 'active'
      AND c.end_date < CURRENT_DATE
  ),
  updated_complete AS (
    UPDATE campaigns
    SET status = 'completed', updated_at = now()
    WHERE id IN (SELECT id FROM campaigns_to_complete)
    RETURNING id
  )
  SELECT COUNT(*) INTO completed_count FROM updated_complete;

  -- 3. Flag campaigns expiring in 3 days (for notification purposes)
  SELECT COUNT(*) INTO expiring_count
  FROM campaigns
  WHERE status = 'active'
    AND end_date = CURRENT_DATE + INTERVAL '3 days';

  -- 4. Flag campaigns with upcoming start dates but no creatives uploaded
  SELECT COUNT(*) INTO deadline_count
  FROM campaigns c
  WHERE c.status = 'pending_creative'
    AND c.start_date <= CURRENT_DATE + INTERVAL '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_creatives cc
      WHERE cc.campaign_id = c.id
    );

  result := json_build_object(
    'activated', activated_count,
    'completed', completed_count,
    'expiring_soon', expiring_count,
    'deadline_warnings', deadline_count,
    'processed_at', now()
  );

  RETURN result;
END;
$$;


-- ============================================================================
-- Improved get_active_ads function with proper date checking and rotation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_ads(p_placement_type TEXT)
RETURNS TABLE (
  campaign_id UUID,
  creative_id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  cta_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS campaign_id,
    cc.id AS creative_id,
    cc.title,
    cc.description,
    cc.image_url,
    cc.link_url,
    cc.cta_text
  FROM campaigns c
  INNER JOIN campaign_creatives cc ON cc.campaign_id = c.id
  WHERE c.status = 'active'
    AND cc.is_approved = true
    AND cc.placement_type = p_placement_type
    AND CURRENT_DATE >= c.start_date::date
    AND CURRENT_DATE <= c.end_date::date
  ORDER BY random()  -- Simple rotation: random selection among active ads
  LIMIT 1;
END;
$$;


-- ============================================================================
-- Ad Rate Card table for admin-managed pricing
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_rate_card (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  placement_type TEXT NOT NULL CHECK (placement_type IN ('top_banner', 'featured_spot', 'below_fold')),
  base_daily_rate NUMERIC(10,2) NOT NULL,
  min_days INT DEFAULT 1,
  max_days INT DEFAULT 365,
  min_lead_time_days INT DEFAULT 3,  -- Minimum days before start_date for creative submission
  discount_7_day NUMERIC(5,2) DEFAULT 0,  -- % discount for 7+ day campaigns
  discount_14_day NUMERIC(5,2) DEFAULT 0,  -- % discount for 14+ day campaigns
  discount_30_day NUMERIC(5,2) DEFAULT 0,  -- % discount for 30+ day campaigns
  peak_multiplier NUMERIC(5,2) DEFAULT 1.5,  -- Multiplier for peak traffic periods
  high_multiplier NUMERIC(5,2) DEFAULT 1.25,
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(placement_type)
);

-- Insert default rate card values
INSERT INTO ad_rate_card (placement_type, base_daily_rate, min_days, max_days, min_lead_time_days, discount_7_day, discount_14_day, discount_30_day)
VALUES
  ('top_banner', 10.00, 1, 365, 3, 5.00, 10.00, 15.00),
  ('featured_spot', 5.00, 1, 365, 3, 5.00, 10.00, 15.00),
  ('below_fold', 5.00, 1, 365, 3, 5.00, 10.00, 15.00)
ON CONFLICT (placement_type) DO NOTHING;

-- RLS for rate card
ALTER TABLE ad_rate_card ENABLE ROW LEVEL SECURITY;

-- Public read access (for pricing display)
DO $$ BEGIN
  CREATE POLICY "Public can read rate card" ON ad_rate_card
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only admins can modify
DO $$ BEGIN
  CREATE POLICY "Admins can manage rate card" ON ad_rate_card
    FOR ALL USING (
      EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin'))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- Improved calculate_campaign_pricing with rate card
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_campaign_pricing(
  p_placement_type TEXT,
  p_days_count INT
)
RETURNS TABLE (
  daily_price NUMERIC,
  total_price NUMERIC,
  discount_percent NUMERIC,
  traffic_multiplier NUMERIC,
  original_daily_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_rate NUMERIC;
  v_discount NUMERIC := 0;
  v_multiplier NUMERIC := 1;
BEGIN
  -- Get base rate from rate card
  SELECT rc.base_daily_rate INTO v_base_rate
  FROM ad_rate_card rc
  WHERE rc.placement_type = p_placement_type
    AND rc.is_active = true;

  IF v_base_rate IS NULL THEN
    -- Fallback defaults
    v_base_rate := CASE p_placement_type
      WHEN 'top_banner' THEN 10.00
      WHEN 'featured_spot' THEN 5.00
      WHEN 'below_fold' THEN 5.00
      ELSE 5.00
    END;
  END IF;

  -- Apply volume discount
  SELECT
    CASE
      WHEN p_days_count >= 30 THEN COALESCE(rc.discount_30_day, 15)
      WHEN p_days_count >= 14 THEN COALESCE(rc.discount_14_day, 10)
      WHEN p_days_count >= 7 THEN COALESCE(rc.discount_7_day, 5)
      ELSE 0
    END INTO v_discount
  FROM ad_rate_card rc
  WHERE rc.placement_type = p_placement_type
    AND rc.is_active = true;

  IF v_discount IS NULL THEN
    v_discount := 0;
  END IF;

  RETURN QUERY
  SELECT
    ROUND(v_base_rate * (1 - v_discount / 100) * v_multiplier, 2) AS daily_price,
    ROUND(v_base_rate * (1 - v_discount / 100) * v_multiplier * p_days_count, 2) AS total_price,
    v_discount AS discount_percent,
    v_multiplier AS traffic_multiplier,
    v_base_rate AS original_daily_price;
END;
$$;
