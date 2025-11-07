-- Self-Service Advertising Platform Enhancement Migration
-- This migration adds all necessary tables and columns for a complete self-service advertising system

-- ============================================================
-- ENUMS AND TYPES
-- ============================================================

-- Traffic tier for dynamic pricing
CREATE TYPE public.traffic_tier AS ENUM ('low', 'medium', 'high', 'peak');

-- Team member roles
CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- Invitation status
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- Refund status
CREATE TYPE public.refund_status AS ENUM ('pending', 'completed', 'failed');

-- Violation severity
CREATE TYPE public.violation_severity AS ENUM ('minor', 'major', 'critical');

-- Update campaign_status enum to add 'rejected' and 'refunded'
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'refunded';

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Pricing Rules Table (for dynamic pricing)
CREATE TABLE public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_type placement_type NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  traffic_multiplier DECIMAL(3,2) DEFAULT 1.0,
  demand_multiplier DECIMAL(3,2) DEFAULT 1.0,
  min_price DECIMAL(10,2) NOT NULL,
  max_price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(placement_type)
);

-- Pricing Overrides Table (admin custom pricing)
CREATE TABLE public.pricing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  original_price DECIMAL(10,2) NOT NULL,
  override_price DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id)
);

-- Campaign Team Members Table (multi-user access)
CREATE TABLE public.campaign_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_member_email TEXT NOT NULL,
  team_member_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'viewer',
  invitation_status invitation_status NOT NULL DEFAULT 'pending',
  invitation_token TEXT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad Impressions Table (tracking)
CREATE TABLE public.ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES public.campaign_creatives(id) ON DELETE CASCADE NOT NULL,
  placement_type placement_type NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  page_url TEXT,
  referrer_url TEXT,
  device_type TEXT,
  browser TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Ad Clicks Table (tracking)
CREATE TABLE public.ad_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impression_id UUID REFERENCES public.ad_impressions(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES public.campaign_creatives(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Campaign Analytics Daily (aggregated metrics)
CREATE TABLE public.campaign_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES public.campaign_creatives(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  cost DECIMAL(10,2) DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, creative_id, date)
);

-- Refunds Table
CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  policy_violation TEXT,
  stripe_refund_id TEXT,
  status refund_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Ad Policies Table
CREATE TABLE public.ad_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name TEXT NOT NULL,
  policy_description TEXT NOT NULL,
  violation_severity violation_severity NOT NULL DEFAULT 'minor',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy Violations Table
CREATE TABLE public.policy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  creative_id UUID REFERENCES public.campaign_creatives(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.ad_policies(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  violation_details TEXT NOT NULL,
  action_taken TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================

-- Enhance campaigns table
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS renewal_eligible BOOLEAN DEFAULT true;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS original_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS traffic_tier traffic_tier DEFAULT 'medium';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS approval_notes TEXT;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- Enhance campaign_creatives table
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS dimensions_width INTEGER;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS dimensions_height INTEGER;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.campaign_creatives ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Campaigns indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON public.campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_original_id ON public.campaigns(original_campaign_id);

-- Campaign creatives indexes
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_approved ON public.campaign_creatives(is_approved);
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_campaign_id ON public.campaign_creatives(campaign_id);

-- Ad impressions indexes
CREATE INDEX IF NOT EXISTS idx_ad_impressions_campaign_date ON public.ad_impressions(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_session ON public.ad_impressions(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_creative_id ON public.ad_impressions(creative_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_date ON public.ad_impressions(date);

-- Ad clicks indexes
CREATE INDEX IF NOT EXISTS idx_ad_clicks_campaign_date ON public.ad_clicks(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_creative_id ON public.ad_clicks(creative_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_impression_id ON public.ad_clicks(impression_id);

-- Pricing rules indexes
CREATE INDEX IF NOT EXISTS idx_pricing_rules_placement ON public.pricing_rules(placement_type, is_active);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON public.campaign_team_members(campaign_owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.campaign_team_members(team_member_email);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.campaign_team_members(invitation_status);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_campaign_date ON public.campaign_analytics_daily(campaign_id, date);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_violations ENABLE ROW LEVEL SECURITY;

-- Pricing Rules Policies
CREATE POLICY "Anyone can view active pricing rules" ON public.pricing_rules
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage pricing rules" ON public.pricing_rules
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Pricing Overrides Policies
CREATE POLICY "Users can view their campaign pricing overrides" ON public.pricing_overrides
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = pricing_overrides.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage pricing overrides" ON public.pricing_overrides
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Team Members Policies
CREATE POLICY "Users can view teams they own or are part of" ON public.campaign_team_members
FOR SELECT USING (
  auth.uid() = campaign_owner_id OR
  auth.uid() = team_member_id OR
  auth.email() = team_member_email
);

CREATE POLICY "Campaign owners can manage their teams" ON public.campaign_team_members
FOR ALL USING (auth.uid() = campaign_owner_id);

-- Ad Impressions Policies (service role only for writes)
CREATE POLICY "Service role can manage impressions" ON public.ad_impressions
FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view impressions for their campaigns" ON public.ad_impressions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = ad_impressions.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

-- Ad Clicks Policies (service role only for writes)
CREATE POLICY "Service role can manage clicks" ON public.ad_clicks
FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view clicks for their campaigns" ON public.ad_clicks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = ad_clicks.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

-- Campaign Analytics Policies
CREATE POLICY "Users can view their campaign analytics" ON public.campaign_analytics_daily
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = campaign_analytics_daily.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage analytics" ON public.campaign_analytics_daily
FOR ALL USING (auth.role() = 'service_role'::text);

-- Refunds Policies
CREATE POLICY "Users can view their campaign refunds" ON public.refunds
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = refunds.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage refunds" ON public.refunds
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Ad Policies Policies
CREATE POLICY "Anyone can view active ad policies" ON public.ad_policies
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage ad policies" ON public.ad_policies
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Policy Violations Policies
CREATE POLICY "Users can view violations for their campaigns" ON public.policy_violations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE campaigns.id = policy_violations.campaign_id
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage policy violations" ON public.policy_violations
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to check campaign access (for team members)
CREATE OR REPLACE FUNCTION public.check_campaign_access(
  p_campaign_id UUID,
  p_user_id UUID,
  p_required_role team_role DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_user_role team_role;
BEGIN
  -- Check if user is campaign owner
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = p_campaign_id AND user_id = p_user_id
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN TRUE;
  END IF;

  -- Check if user is team member with sufficient role
  SELECT role INTO v_user_role
  FROM public.campaign_team_members
  WHERE campaign_owner_id = (SELECT user_id FROM public.campaigns WHERE id = p_campaign_id)
    AND team_member_id = p_user_id
    AND invitation_status = 'accepted';

  IF v_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Role hierarchy: owner > admin > editor > viewer
  IF p_required_role = 'viewer' THEN
    RETURN TRUE;
  ELSIF p_required_role = 'editor' THEN
    RETURN v_user_role IN ('editor', 'admin', 'owner');
  ELSIF p_required_role = 'admin' THEN
    RETURN v_user_role IN ('admin', 'owner');
  ELSIF p_required_role = 'owner' THEN
    RETURN v_user_role = 'owner';
  END IF;

  RETURN FALSE;
END;
$$;

-- Enhanced get_active_ads function with frequency capping
-- First drop the existing function to avoid naming conflicts
DROP FUNCTION IF EXISTS public.get_active_ads(placement_type);

CREATE OR REPLACE FUNCTION public.get_active_ads(
  p_placement_type placement_type,
  p_session_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
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
  SELECT DISTINCT ON (c.id)
    c.id as campaign_id,
    cc.id as creative_id,
    cc.title,
    cc.description,
    cc.image_url,
    cc.link_url,
    cc.cta_text
  FROM public.campaigns c
  JOIN public.campaign_placements cp ON cp.campaign_id = c.id
  JOIN public.campaign_creatives cc ON cc.campaign_id = c.id AND cc.placement_type = p_placement_type
  WHERE
    c.status = 'active'
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND cc.is_approved = true
    AND cp.placement_type = p_placement_type
    -- Frequency cap: not shown to this session in last 5 minutes
    AND (p_session_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.ad_impressions
      WHERE campaign_id = c.id
        AND session_id = p_session_id
        AND timestamp > NOW() - INTERVAL '5 minutes'
    ))
    -- Frequency cap: not shown to this user more than 10 times today
    AND (p_user_id IS NULL OR (
      SELECT COUNT(*) FROM public.ad_impressions
      WHERE campaign_id = c.id
        AND user_id = p_user_id
        AND date = CURRENT_DATE
    ) < 10)
  ORDER BY c.id, RANDOM()
  LIMIT 1;
END;
$$;

-- Function to calculate current pricing
CREATE OR REPLACE FUNCTION public.calculate_campaign_pricing(
  p_placement_type placement_type,
  p_days_count INTEGER
) RETURNS TABLE (
  daily_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  base_price DECIMAL(10,2),
  traffic_multiplier DECIMAL(3,2),
  demand_multiplier DECIMAL(3,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_final_price DECIMAL(10,2);
BEGIN
  -- Get pricing rule for placement type
  SELECT * INTO v_rule
  FROM public.pricing_rules
  WHERE placement_type = p_placement_type
    AND is_active = true
  LIMIT 1;

  IF v_rule IS NULL THEN
    -- Fallback to default pricing if no rule exists
    CASE p_placement_type
      WHEN 'top_banner' THEN
        v_rule.base_price := 10.00;
      WHEN 'featured_spot' THEN
        v_rule.base_price := 5.00;
      WHEN 'below_fold' THEN
        v_rule.base_price := 5.00;
    END CASE;
    v_rule.traffic_multiplier := 1.0;
    v_rule.demand_multiplier := 1.0;
    v_rule.min_price := v_rule.base_price;
    v_rule.max_price := v_rule.base_price * 3;
  END IF;

  -- Calculate final price
  v_final_price := v_rule.base_price * v_rule.traffic_multiplier * v_rule.demand_multiplier;

  -- Apply min/max constraints
  v_final_price := GREATEST(v_rule.min_price, LEAST(v_rule.max_price, v_final_price));

  RETURN QUERY
  SELECT
    v_final_price as daily_price,
    v_final_price * p_days_count as total_price,
    v_rule.base_price as base_price,
    v_rule.traffic_multiplier as traffic_multiplier,
    v_rule.demand_multiplier as demand_multiplier;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Trigger for updated_at on pricing_rules
CREATE TRIGGER update_pricing_rules_updated_at
BEFORE UPDATE ON public.pricing_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on campaign_team_members
CREATE TRIGGER update_campaign_team_members_updated_at
BEFORE UPDATE ON public.campaign_team_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on campaign_analytics_daily
CREATE TRIGGER update_campaign_analytics_daily_updated_at
BEFORE UPDATE ON public.campaign_analytics_daily
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on ad_policies
CREATE TRIGGER update_ad_policies_updated_at
BEFORE UPDATE ON public.ad_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Insert default pricing rules
INSERT INTO public.pricing_rules (placement_type, base_price, min_price, max_price, traffic_multiplier, demand_multiplier)
VALUES
  ('top_banner', 10.00, 8.00, 30.00, 1.0, 1.0),
  ('featured_spot', 5.00, 4.00, 15.00, 1.0, 1.0),
  ('below_fold', 5.00, 4.00, 15.00, 1.0, 1.0)
ON CONFLICT (placement_type) DO NOTHING;

-- Insert default ad policies
INSERT INTO public.ad_policies (policy_name, policy_description, violation_severity)
VALUES
  ('No Deceptive Claims', 'Advertisements must not contain false, misleading, or deceptive claims about products or services.', 'major'),
  ('No Prohibited Products', 'Advertisements for tobacco, weapons, adult content, illegal drugs, or other prohibited products are not allowed.', 'critical'),
  ('No Copyright Infringement', 'All creative content must be original or properly licensed. No unauthorized use of copyrighted material.', 'major'),
  ('No Malware or Phishing', 'Destination URLs must be safe and secure. No links to malware, phishing sites, or malicious content.', 'critical'),
  ('FTC Compliance', 'All advertisements must comply with FTC guidelines including proper disclosure of sponsored content.', 'major'),
  ('Appropriate Image Quality', 'Images must meet minimum quality standards and be appropriate for the specified dimensions.', 'minor'),
  ('Functional URLs', 'All destination URLs must be valid, functional, and lead to the advertised content.', 'minor'),
  ('No Competitor Targeting', 'Advertisements must not unfairly target or disparage competitors.', 'minor')
ON CONFLICT DO NOTHING;

-- ============================================================
-- COMMENTS (Documentation)
-- ============================================================

COMMENT ON TABLE public.pricing_rules IS 'Dynamic pricing rules for ad placements based on traffic and demand';
COMMENT ON TABLE public.pricing_overrides IS 'Admin-defined custom pricing for specific campaigns';
COMMENT ON TABLE public.campaign_team_members IS 'Team collaboration - multiple users can access and manage campaigns';
COMMENT ON TABLE public.ad_impressions IS 'Tracks every time an ad is displayed (viewability tracking)';
COMMENT ON TABLE public.ad_clicks IS 'Tracks every time an ad is clicked';
COMMENT ON TABLE public.campaign_analytics_daily IS 'Aggregated daily analytics for campaigns and creatives';
COMMENT ON TABLE public.refunds IS 'Refund records for campaigns with policy violations or issues';
COMMENT ON TABLE public.ad_policies IS 'Advertisement content policies and guidelines';
COMMENT ON TABLE public.policy_violations IS 'Records of policy violations by campaigns/creatives';

COMMENT ON FUNCTION public.check_campaign_access IS 'Checks if a user has access to a campaign based on ownership or team membership';
COMMENT ON FUNCTION public.get_active_ads IS 'Returns active ads with frequency capping to prevent ad fatigue';
COMMENT ON FUNCTION public.calculate_campaign_pricing IS 'Calculates current pricing based on dynamic rules (traffic, demand)';
