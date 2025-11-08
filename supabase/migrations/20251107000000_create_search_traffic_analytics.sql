-- Create Search Traffic Analytics System
-- This migration creates tables and functions for managing multiple analytics platform integrations

-- 1. OAuth Provider Configuration Table
CREATE TABLE IF NOT EXISTS oauth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE, -- 'google_analytics', 'google_search_console', 'bing_webmaster', 'yandex_webmaster'
  client_id TEXT,
  client_secret TEXT,
  authorization_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User OAuth Tokens Table (stores access tokens per user per provider)
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL REFERENCES oauth_providers(provider_name) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scope TEXT,
  property_id TEXT, -- For GA property, GSC site URL, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_name, property_id)
);

-- 3. Analytics Properties/Sites Table (tracks which properties user has access to)
CREATE TABLE IF NOT EXISTS analytics_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT NOT NULL, -- GA property ID, GSC site URL, etc.
  property_name TEXT NOT NULL,
  property_url TEXT,
  is_primary BOOLEAN DEFAULT false, -- Mark primary property for dashboard
  metadata JSONB, -- Store additional provider-specific data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_name, property_id)
);

-- 4. Traffic Metrics Data (aggregated daily metrics)
CREATE TABLE IF NOT EXISTS traffic_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  sessions INTEGER,
  users INTEGER,
  pageviews INTEGER,
  bounce_rate NUMERIC(5,2),
  avg_session_duration NUMERIC(10,2),
  new_users INTEGER,
  device_category TEXT, -- 'desktop', 'mobile', 'tablet'
  country TEXT,
  metadata JSONB, -- Provider-specific additional metrics
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Search Performance Metrics (SEO/Search Console data)
CREATE TABLE IF NOT EXISTS search_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  query TEXT, -- Search query
  page TEXT, -- Landing page URL
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC(5,2), -- Click-through rate
  "position" NUMERIC(5,2), -- Average position
  device TEXT, -- 'desktop', 'mobile', 'tablet'
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Keyword Rankings (Track keyword positions over time)
CREATE TABLE IF NOT EXISTS keyword_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT NOT NULL,
  tracked_date DATE NOT NULL,
  keyword TEXT NOT NULL,
  url TEXT, -- Landing page
  "position" INTEGER,
  search_volume INTEGER,
  competition TEXT, -- 'low', 'medium', 'high'
  cpc NUMERIC(10,2), -- Cost per click
  trend TEXT, -- 'up', 'down', 'stable'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Site Health Metrics (Technical SEO issues from Search Console, Bing, Yandex)
CREATE TABLE IF NOT EXISTS site_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT NOT NULL,
  check_date DATE NOT NULL,
  metric_type TEXT NOT NULL, -- 'crawl_error', 'mobile_usability', 'core_web_vitals', etc.
  severity TEXT, -- 'critical', 'warning', 'info'
  affected_urls INTEGER,
  issue_description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Analytics Sync Jobs (Track data synchronization status)
CREATE TABLE IF NOT EXISTS analytics_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  property_id TEXT,
  job_type TEXT NOT NULL, -- 'full_sync', 'incremental_sync', 'real_time'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  start_date DATE,
  end_date DATE,
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_user_id ON user_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_provider ON user_oauth_tokens(provider_name);
CREATE INDEX IF NOT EXISTS idx_analytics_properties_user_id ON analytics_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_properties_provider ON analytics_properties(provider_name);
CREATE INDEX IF NOT EXISTS idx_traffic_metrics_user_date ON traffic_metrics(user_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_metrics_property ON traffic_metrics(property_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_search_performance_user_date ON search_performance(user_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_search_performance_query ON search_performance(query, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword ON keyword_rankings(keyword, tracked_date DESC);
CREATE INDEX IF NOT EXISTS idx_site_health_date ON site_health_metrics(user_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sync_jobs_status ON analytics_sync_jobs(status, created_at DESC);

-- Insert default OAuth provider configurations
INSERT INTO oauth_providers (provider_name, authorization_url, token_url, scopes) VALUES
  (
    'google_analytics',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    ARRAY['https://www.googleapis.com/auth/analytics.readonly']
  ),
  (
    'google_search_console',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    ARRAY['https://www.googleapis.com/auth/webmasters.readonly']
  ),
  (
    'bing_webmaster',
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    ARRAY['https://api.bing.microsoft.com/webmaster/user_impersonation']
  ),
  (
    'yandex_webmaster',
    'https://oauth.yandex.com/authorize',
    'https://oauth.yandex.com/token',
    ARRAY['metrika:read']
  )
ON CONFLICT (provider_name) DO NOTHING;

-- Create function to refresh OAuth tokens automatically
CREATE OR REPLACE FUNCTION refresh_oauth_token(
  p_user_id UUID,
  p_provider_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_token_record user_oauth_tokens%ROWTYPE;
  v_provider oauth_providers%ROWTYPE;
BEGIN
  -- Get the token record
  SELECT * INTO v_token_record
  FROM user_oauth_tokens
  WHERE user_id = p_user_id AND provider_name = p_provider_name
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not found');
  END IF;

  -- Get provider config
  SELECT * INTO v_provider
  FROM oauth_providers
  WHERE provider_name = p_provider_name;

  -- Return the data needed for refresh
  RETURN jsonb_build_object(
    'success', true,
    'refresh_token', v_token_record.refresh_token,
    'token_url', v_provider.token_url,
    'client_id', v_provider.client_id,
    'client_secret', v_provider.client_secret
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get aggregated traffic metrics
CREATE OR REPLACE FUNCTION get_traffic_summary(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  metric_date DATE,
  total_sessions BIGINT,
  total_users BIGINT,
  total_pageviews BIGINT,
  avg_bounce_rate NUMERIC,
  avg_session_duration NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.metric_date,
    SUM(tm.sessions)::BIGINT as total_sessions,
    SUM(tm.users)::BIGINT as total_users,
    SUM(tm.pageviews)::BIGINT as total_pageviews,
    AVG(tm.bounce_rate) as avg_bounce_rate,
    AVG(tm.avg_session_duration) as avg_session_duration
  FROM traffic_metrics tm
  WHERE tm.user_id = p_user_id
    AND tm.metric_date BETWEEN p_start_date AND p_end_date
  GROUP BY tm.metric_date
  ORDER BY tm.metric_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get top performing keywords
CREATE OR REPLACE FUNCTION get_top_keywords(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  query TEXT,
  total_impressions BIGINT,
  total_clicks BIGINT,
  avg_ctr NUMERIC,
  avg_position NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.query,
    SUM(sp.impressions)::BIGINT as total_impressions,
    SUM(sp.clicks)::BIGINT as total_clicks,
    AVG(sp.ctr) as avg_ctr,
    AVG(sp."position") as avg_position
  FROM search_performance sp
  WHERE sp.user_id = p_user_id
    AND sp.metric_date BETWEEN p_start_date AND p_end_date
    AND sp.query IS NOT NULL
  GROUP BY sp.query
  ORDER BY total_clicks DESC, total_impressions DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to detect SEO opportunities
CREATE OR REPLACE FUNCTION get_seo_opportunities(
  p_user_id UUID,
  p_days_back INTEGER DEFAULT 30
) RETURNS TABLE (
  opportunity_type TEXT,
  query TEXT,
  page TEXT,
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC,
  "position" NUMERIC,
  potential_impact TEXT,
  recommendation TEXT
) AS $$
BEGIN
  -- Find high-impression, low-CTR queries (opportunity to improve CTR)
  RETURN QUERY
  SELECT
    'Low CTR'::TEXT as opportunity_type,
    sp.query,
    sp.page,
    AVG(sp.impressions)::INTEGER as impressions,
    AVG(sp.clicks)::INTEGER as clicks,
    AVG(sp.ctr) as ctr,
    AVG(sp."position") as "position",
    'High'::TEXT as potential_impact,
    'Improve title and meta description to increase CTR'::TEXT as recommendation
  FROM search_performance sp
  WHERE sp.user_id = p_user_id
    AND sp.metric_date >= CURRENT_DATE - p_days_back
    AND sp.impressions > 100
    AND sp.ctr < 2.0
    AND sp."position" <= 10
  GROUP BY sp.query, sp.page

  UNION ALL

  -- Find queries ranking 11-20 (opportunity to reach first page)
  SELECT
    'Near First Page'::TEXT as opportunity_type,
    sp.query,
    sp.page,
    AVG(sp.impressions)::INTEGER as impressions,
    AVG(sp.clicks)::INTEGER as clicks,
    AVG(sp.ctr) as ctr,
    AVG(sp."position") as "position",
    'Medium'::TEXT as potential_impact,
    'Optimize content to reach first page'::TEXT as recommendation
  FROM search_performance sp
  WHERE sp.user_id = p_user_id
    AND sp.metric_date >= CURRENT_DATE - p_days_back
    AND sp."position" > 10 AND sp."position" <= 20
    AND sp.impressions > 50
  GROUP BY sp.query, sp.page

  UNION ALL

  -- Find declining keywords
  SELECT
    'Declining Keyword'::TEXT as opportunity_type,
    kr.keyword as query,
    kr.url as page,
    NULL::INTEGER as impressions,
    NULL::INTEGER as clicks,
    NULL::NUMERIC as ctr,
    AVG(kr."position") as "position",
    'High'::TEXT as potential_impact,
    'Investigate why ranking is dropping'::TEXT as recommendation
  FROM keyword_rankings kr
  WHERE kr.user_id = p_user_id
    AND kr.tracked_date >= CURRENT_DATE - p_days_back
    AND kr.trend = 'down'
  GROUP BY kr.keyword, kr.url

  ORDER BY potential_impact DESC, impressions DESC NULLS LAST
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS (Row Level Security)
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (users can only access their own data)
CREATE POLICY user_oauth_tokens_policy ON user_oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY analytics_properties_policy ON analytics_properties
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY traffic_metrics_policy ON traffic_metrics
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY search_performance_policy ON search_performance
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY keyword_rankings_policy ON keyword_rankings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY site_health_metrics_policy ON site_health_metrics
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY analytics_sync_jobs_policy ON analytics_sync_jobs
  FOR ALL USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT ON oauth_providers TO authenticated;
GRANT ALL ON user_oauth_tokens TO authenticated;
GRANT ALL ON analytics_properties TO authenticated;
GRANT ALL ON traffic_metrics TO authenticated;
GRANT ALL ON search_performance TO authenticated;
GRANT ALL ON keyword_rankings TO authenticated;
GRANT ALL ON site_health_metrics TO authenticated;
GRANT ALL ON analytics_sync_jobs TO authenticated;
