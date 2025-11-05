-- ============================================================================
-- SEO Management System - Google Search Console Integration
-- ============================================================================
-- Description: Google Search Console OAuth and data integration tables
-- Created: 2025-11-04
-- Tables: 4 GSC integration tables
--   - gsc_oauth_credentials: OAuth tokens for GSC API access
--   - gsc_properties: Verified GSC properties
--   - gsc_keyword_performance: Keyword data from GSC
--   - gsc_page_performance: Page-level performance data from GSC
-- ============================================================================

-- ============================================================================
-- Table: gsc_oauth_credentials
-- Purpose: Store OAuth credentials for Google Search Console API access
-- Security: Encrypted sensitive data, admin-only access
-- ============================================================================
CREATE TABLE IF NOT EXISTS gsc_oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OAuth Details
  access_token TEXT NOT NULL, -- Encrypted in application layer
  refresh_token TEXT, -- Encrypted in application layer
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,

  -- Scope and Permissions
  scope TEXT, -- Space-separated list of granted scopes

  -- User Association
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,

  -- Error Tracking
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsc_oauth_user_id ON gsc_oauth_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_gsc_oauth_active ON gsc_oauth_credentials(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_gsc_oauth_expires_at ON gsc_oauth_credentials(expires_at);

-- Comments
COMMENT ON TABLE gsc_oauth_credentials IS 'OAuth credentials for Google Search Console API access';
COMMENT ON COLUMN gsc_oauth_credentials.access_token IS 'Access token - should be encrypted in application layer';
COMMENT ON COLUMN gsc_oauth_credentials.refresh_token IS 'Refresh token - should be encrypted in application layer';

-- ============================================================================
-- Table: gsc_properties
-- Purpose: Store verified Google Search Console properties
-- ============================================================================
CREATE TABLE IF NOT EXISTS gsc_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Property Details
  property_url TEXT NOT NULL UNIQUE, -- e.g., https://example.com/ or sc-domain:example.com
  property_type TEXT CHECK (property_type IN ('URL_PREFIX', 'DOMAIN')),
  permission_level TEXT CHECK (permission_level IN ('siteOwner', 'siteFullUser', 'siteRestrictedUser', 'siteUnverifiedUser')),

  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verification_method TEXT, -- DNS, HTML file, HTML tag, Google Analytics, Google Tag Manager

  -- Sync Configuration
  is_syncing BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency_hours INTEGER DEFAULT 24,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,

  -- Data Range Configuration
  default_date_range_days INTEGER DEFAULT 28, -- How many days of data to fetch

  -- Associated Credentials
  oauth_credential_id UUID REFERENCES gsc_oauth_credentials(id) ON DELETE SET NULL,

  -- Statistics Summary
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  average_ctr DECIMAL(5,2),
  average_position DECIMAL(5,2),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsc_properties_url ON gsc_properties(property_url);
CREATE INDEX IF NOT EXISTS idx_gsc_properties_syncing ON gsc_properties(is_syncing) WHERE is_syncing = true;
CREATE INDEX IF NOT EXISTS idx_gsc_properties_next_sync ON gsc_properties(next_sync_at) WHERE sync_enabled = true;
CREATE INDEX IF NOT EXISTS idx_gsc_properties_oauth_id ON gsc_properties(oauth_credential_id);

-- Comments
COMMENT ON TABLE gsc_properties IS 'Verified Google Search Console properties and sync configuration';
COMMENT ON COLUMN gsc_properties.property_type IS 'URL_PREFIX for URL properties (https://example.com/), DOMAIN for domain properties (sc-domain:example.com)';

-- ============================================================================
-- Table: gsc_keyword_performance
-- Purpose: Keyword performance data from Google Search Console
-- ============================================================================
CREATE TABLE IF NOT EXISTS gsc_keyword_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  property_id UUID NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES seo_keywords(id) ON DELETE SET NULL, -- Link to tracked keywords if exists

  -- Keyword Details
  query TEXT NOT NULL, -- The search query
  page_url TEXT, -- Landing page for this query

  -- Date Range
  date DATE NOT NULL,
  data_age_days INTEGER GENERATED ALWAYS AS (EXTRACT(DAY FROM (CURRENT_DATE - date))) STORED,

  -- Performance Metrics
  impressions BIGINT DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2), -- Click-through rate (%)
  position DECIMAL(5,2), -- Average position

  -- Device Breakdown (optional, from detailed queries)
  impressions_mobile BIGINT DEFAULT 0,
  impressions_desktop BIGINT DEFAULT 0,
  impressions_tablet BIGINT DEFAULT 0,

  -- Country (if tracking multiple countries)
  country TEXT DEFAULT 'USA',

  -- Change Indicators
  impressions_change INTEGER,
  clicks_change INTEGER,
  position_change DECIMAL(5,2),

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_property ON gsc_keyword_performance(property_id);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_query ON gsc_keyword_performance(query);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_date ON gsc_keyword_performance(date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_clicks ON gsc_keyword_performance(clicks DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_impressions ON gsc_keyword_performance(impressions DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword_perf_composite ON gsc_keyword_performance(property_id, date DESC, clicks DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_keyword_perf_unique ON gsc_keyword_performance(property_id, query, date, country);

-- Comments
COMMENT ON TABLE gsc_keyword_performance IS 'Keyword performance data imported from Google Search Console';
COMMENT ON COLUMN gsc_keyword_performance.data_age_days IS 'Automatically calculated age of data in days';

-- ============================================================================
-- Table: gsc_page_performance
-- Purpose: Page-level performance data from Google Search Console
-- ============================================================================
CREATE TABLE IF NOT EXISTS gsc_page_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  property_id UUID NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,

  -- Page Details
  page_url TEXT NOT NULL,

  -- Date Range
  date DATE NOT NULL,
  data_age_days INTEGER GENERATED ALWAYS AS (EXTRACT(DAY FROM (CURRENT_DATE - date))) STORED,

  -- Performance Metrics
  impressions BIGINT DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2),
  position DECIMAL(5,2),

  -- Device Breakdown
  impressions_mobile BIGINT DEFAULT 0,
  impressions_desktop BIGINT DEFAULT 0,
  impressions_tablet BIGINT DEFAULT 0,
  clicks_mobile INTEGER DEFAULT 0,
  clicks_desktop INTEGER DEFAULT 0,
  clicks_tablet INTEGER DEFAULT 0,

  -- Top Queries for this page (JSONB for flexibility)
  top_queries JSONB, -- [{query, impressions, clicks, ctr, position}]

  -- Country (if tracking multiple countries)
  country TEXT DEFAULT 'USA',

  -- Change Indicators (compared to previous period)
  impressions_change INTEGER,
  clicks_change INTEGER,
  position_change DECIMAL(5,2),

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_property ON gsc_page_performance(property_id);
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_url ON gsc_page_performance(page_url);
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_date ON gsc_page_performance(date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_clicks ON gsc_page_performance(clicks DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_impressions ON gsc_page_performance(impressions DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_page_perf_composite ON gsc_page_performance(property_id, date DESC, clicks DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_page_perf_unique ON gsc_page_performance(property_id, page_url, date, country);

-- Comments
COMMENT ON TABLE gsc_page_performance IS 'Page-level performance data imported from Google Search Console';
COMMENT ON COLUMN gsc_page_performance.top_queries IS 'Top performing queries for this page';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE gsc_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_keyword_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_page_performance ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access for all GSC tables
-- ============================================================================

-- gsc_oauth_credentials policies
CREATE POLICY "Admin full access to gsc_oauth_credentials"
  ON gsc_oauth_credentials FOR ALL
  USING (is_admin());

-- gsc_properties policies
CREATE POLICY "Admin full access to gsc_properties"
  ON gsc_properties FOR ALL
  USING (is_admin());

-- gsc_keyword_performance policies
CREATE POLICY "Admin full access to gsc_keyword_performance"
  ON gsc_keyword_performance FOR ALL
  USING (is_admin());

-- gsc_page_performance policies
CREATE POLICY "Admin full access to gsc_page_performance"
  ON gsc_page_performance FOR ALL
  USING (is_admin());

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================

CREATE TRIGGER update_gsc_oauth_credentials_updated_at
  BEFORE UPDATE ON gsc_oauth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gsc_properties_updated_at
  BEFORE UPDATE ON gsc_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions for GSC Integration
-- ============================================================================

-- Function to check if OAuth token is expired
CREATE OR REPLACE FUNCTION is_gsc_token_expired(credential_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  token_expires_at TIMESTAMPTZ;
BEGIN
  SELECT expires_at INTO token_expires_at
  FROM gsc_oauth_credentials
  WHERE id = credential_id AND is_active = true;

  IF token_expires_at IS NULL THEN
    RETURN true;
  END IF;

  -- Token is expired if it expires within the next 5 minutes
  RETURN token_expires_at < (now() + INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active GSC credential for a user
CREATE OR REPLACE FUNCTION get_active_gsc_credential(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  credential_id UUID;
BEGIN
  SELECT id INTO credential_id
  FROM gsc_oauth_credentials
  WHERE user_id = p_user_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY last_used_at DESC NULLS LAST
  LIMIT 1;

  RETURN credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark token as used
CREATE OR REPLACE FUNCTION mark_gsc_token_used(credential_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE gsc_oauth_credentials
  SET last_used_at = now()
  WHERE id = credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync keyword data from GSC to seo_keywords table
CREATE OR REPLACE FUNCTION sync_gsc_to_keywords()
RETURNS INTEGER AS $$
DECLARE
  rows_synced INTEGER := 0;
BEGIN
  -- Update existing keywords with GSC data (last 7 days average)
  WITH recent_gsc_data AS (
    SELECT
      query,
      page_url,
      AVG(position) as avg_position,
      SUM(impressions) as total_impressions,
      SUM(clicks) as total_clicks,
      AVG(ctr) as avg_ctr
    FROM gsc_keyword_performance
    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY query, page_url
  )
  UPDATE seo_keywords k
  SET
    current_position = ROUND(r.avg_position),
    impressions = r.total_impressions,
    clicks = r.total_clicks,
    ctr = ROUND(r.avg_ctr, 2),
    last_checked_at = now(),
    updated_at = now()
  FROM recent_gsc_data r
  WHERE k.keyword = r.query
    AND k.target_url = r.page_url;

  GET DIAGNOSTICS rows_synced = ROW_COUNT;

  RETURN rows_synced;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate next sync time for properties
CREATE OR REPLACE FUNCTION calculate_next_gsc_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sync_enabled = true AND NEW.sync_frequency_hours > 0 THEN
    NEW.next_sync_at := now() + (NEW.sync_frequency_hours || ' hours')::INTERVAL;
  ELSE
    NEW.next_sync_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_next_gsc_sync
  BEFORE INSERT OR UPDATE ON gsc_properties
  FOR EACH ROW
  WHEN (NEW.last_sync_at IS NOT NULL)
  EXECUTE FUNCTION calculate_next_gsc_sync();

-- Function to update property statistics
CREATE OR REPLACE FUNCTION update_gsc_property_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update property statistics based on recent performance data
  UPDATE gsc_properties
  SET
    total_impressions = (
      SELECT COALESCE(SUM(impressions), 0)
      FROM gsc_page_performance
      WHERE property_id = NEW.property_id
        AND date >= CURRENT_DATE - INTERVAL '28 days'
    ),
    total_clicks = (
      SELECT COALESCE(SUM(clicks), 0)
      FROM gsc_page_performance
      WHERE property_id = NEW.property_id
        AND date >= CURRENT_DATE - INTERVAL '28 days'
    ),
    average_ctr = (
      SELECT ROUND(AVG(ctr), 2)
      FROM gsc_page_performance
      WHERE property_id = NEW.property_id
        AND date >= CURRENT_DATE - INTERVAL '28 days'
        AND ctr IS NOT NULL
    ),
    average_position = (
      SELECT ROUND(AVG(position), 2)
      FROM gsc_page_performance
      WHERE property_id = NEW.property_id
        AND date >= CURRENT_DATE - INTERVAL '28 days'
        AND position IS NOT NULL
    ),
    updated_at = now()
  WHERE id = NEW.property_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update property stats after new performance data
CREATE TRIGGER trigger_update_gsc_property_stats
  AFTER INSERT OR UPDATE ON gsc_page_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_gsc_property_stats();

-- ============================================================================
-- Cleanup function for old GSC data
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_gsc_data()
RETURNS TABLE(
  deleted_keyword_records BIGINT,
  deleted_page_records BIGINT
) AS $$
DECLARE
  keyword_deleted BIGINT;
  page_deleted BIGINT;
BEGIN
  -- Delete keyword performance data older than 90 days
  DELETE FROM gsc_keyword_performance
  WHERE date < CURRENT_DATE - INTERVAL '90 days';

  GET DIAGNOSTICS keyword_deleted = ROW_COUNT;

  -- Delete page performance data older than 90 days
  DELETE FROM gsc_page_performance
  WHERE date < CURRENT_DATE - INTERVAL '90 days';

  GET DIAGNOSTICS page_deleted = ROW_COUNT;

  RETURN QUERY SELECT keyword_deleted, page_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Views for easier data access
-- ============================================================================

-- View: Recent keyword performance (last 7 days)
CREATE OR REPLACE VIEW v_gsc_recent_keywords AS
SELECT
  p.property_url,
  k.query,
  k.page_url,
  SUM(k.impressions) as total_impressions,
  SUM(k.clicks) as total_clicks,
  ROUND(AVG(k.ctr), 2) as avg_ctr,
  ROUND(AVG(k.position), 2) as avg_position,
  MAX(k.date) as latest_date
FROM gsc_keyword_performance k
JOIN gsc_properties p ON p.id = k.property_id
WHERE k.date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY p.property_url, k.query, k.page_url
ORDER BY total_clicks DESC;

-- View: Recent page performance (last 7 days)
CREATE OR REPLACE VIEW v_gsc_recent_pages AS
SELECT
  p.property_url,
  pg.page_url,
  SUM(pg.impressions) as total_impressions,
  SUM(pg.clicks) as total_clicks,
  ROUND(AVG(pg.ctr), 2) as avg_ctr,
  ROUND(AVG(pg.position), 2) as avg_position,
  MAX(pg.date) as latest_date
FROM gsc_page_performance pg
JOIN gsc_properties p ON p.id = pg.property_id
WHERE pg.date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY p.property_url, pg.page_url
ORDER BY total_clicks DESC;

-- Comments on views
COMMENT ON VIEW v_gsc_recent_keywords IS 'Recent keyword performance from GSC (last 7 days aggregated)';
COMMENT ON VIEW v_gsc_recent_pages IS 'Recent page performance from GSC (last 7 days aggregated)';

-- ============================================================================
-- End of Migration
-- ============================================================================
