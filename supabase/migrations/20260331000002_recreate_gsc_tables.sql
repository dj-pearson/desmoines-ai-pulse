-- ============================================================================
-- Drop and recreate all GSC tables
-- ============================================================================
-- The previous attempt left orphaned composite types in pg_type without
-- actual pg_class relations, blocking CREATE TABLE IF NOT EXISTS.
-- We drop tables (which also drops their types) then drop any remaining
-- orphaned types, then recreate everything cleanly.
-- These tables are brand-new with no data so dropping them is safe.
-- ============================================================================

-- Step 1: Drop tables in FK-safe order (children first)
DROP TABLE IF EXISTS gsc_page_performance    CASCADE;
DROP TABLE IF EXISTS gsc_keyword_performance CASCADE;
DROP TABLE IF EXISTS gsc_properties          CASCADE;
DROP TABLE IF EXISTS gsc_oauth_credentials   CASCADE;

-- Step 2: Drop any orphaned composite types that survived the table drops
DROP TYPE IF EXISTS gsc_page_performance    CASCADE;
DROP TYPE IF EXISTS gsc_keyword_performance CASCADE;
DROP TYPE IF EXISTS gsc_properties          CASCADE;
DROP TYPE IF EXISTS gsc_oauth_credentials   CASCADE;

-- ============================================================================
-- Table: gsc_oauth_credentials
-- ============================================================================
CREATE TABLE gsc_oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gsc_oauth_user_id    ON gsc_oauth_credentials(user_id);
CREATE INDEX idx_gsc_oauth_active     ON gsc_oauth_credentials(is_active) WHERE is_active = true;
CREATE INDEX idx_gsc_oauth_expires_at ON gsc_oauth_credentials(expires_at);

-- ============================================================================
-- Table: gsc_properties
-- ============================================================================
CREATE TABLE gsc_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_url TEXT NOT NULL UNIQUE,
  property_type TEXT CHECK (property_type IN ('URL_PREFIX', 'DOMAIN')),
  permission_level TEXT CHECK (permission_level IN ('siteOwner', 'siteFullUser', 'siteRestrictedUser', 'siteUnverifiedUser')),
  is_verified BOOLEAN DEFAULT false,
  verification_method TEXT,
  is_syncing BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency_hours INTEGER DEFAULT 24,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  default_date_range_days INTEGER DEFAULT 28,
  oauth_credential_id UUID REFERENCES gsc_oauth_credentials(id) ON DELETE SET NULL,
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  average_ctr DECIMAL(5,2),
  average_position DECIMAL(5,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_gsc_properties_url       ON gsc_properties(property_url);
CREATE INDEX idx_gsc_properties_syncing   ON gsc_properties(is_syncing) WHERE is_syncing = true;
CREATE INDEX idx_gsc_properties_next_sync ON gsc_properties(next_sync_at) WHERE sync_enabled = true;
CREATE INDEX idx_gsc_properties_oauth_id  ON gsc_properties(oauth_credential_id);

-- ============================================================================
-- Table: gsc_keyword_performance
-- ============================================================================
CREATE TABLE gsc_keyword_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  keyword_id UUID,
  query TEXT NOT NULL,
  page_url TEXT,
  date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2),
  position DECIMAL(5,2),
  impressions_mobile BIGINT DEFAULT 0,
  impressions_desktop BIGINT DEFAULT 0,
  impressions_tablet BIGINT DEFAULT 0,
  country TEXT DEFAULT 'USA',
  impressions_change INTEGER,
  clicks_change INTEGER,
  position_change DECIMAL(5,2),
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gsc_keyword_perf_property    ON gsc_keyword_performance(property_id);
CREATE INDEX idx_gsc_keyword_perf_query       ON gsc_keyword_performance(query);
CREATE INDEX idx_gsc_keyword_perf_date        ON gsc_keyword_performance(date DESC);
CREATE INDEX idx_gsc_keyword_perf_clicks      ON gsc_keyword_performance(clicks DESC);
CREATE INDEX idx_gsc_keyword_perf_impressions ON gsc_keyword_performance(impressions DESC);
CREATE INDEX idx_gsc_keyword_perf_composite   ON gsc_keyword_performance(property_id, date DESC, clicks DESC);
CREATE UNIQUE INDEX idx_gsc_keyword_perf_unique ON gsc_keyword_performance(property_id, query, date, country);

-- ============================================================================
-- Table: gsc_page_performance
-- ============================================================================
CREATE TABLE gsc_page_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES gsc_properties(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2),
  position DECIMAL(5,2),
  impressions_mobile BIGINT DEFAULT 0,
  impressions_desktop BIGINT DEFAULT 0,
  impressions_tablet BIGINT DEFAULT 0,
  clicks_mobile INTEGER DEFAULT 0,
  clicks_desktop INTEGER DEFAULT 0,
  clicks_tablet INTEGER DEFAULT 0,
  top_queries JSONB,
  country TEXT DEFAULT 'USA',
  impressions_change INTEGER,
  clicks_change INTEGER,
  position_change DECIMAL(5,2),
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gsc_page_perf_property    ON gsc_page_performance(property_id);
CREATE INDEX idx_gsc_page_perf_url         ON gsc_page_performance(page_url);
CREATE INDEX idx_gsc_page_perf_date        ON gsc_page_performance(date DESC);
CREATE INDEX idx_gsc_page_perf_clicks      ON gsc_page_performance(clicks DESC);
CREATE INDEX idx_gsc_page_perf_impressions ON gsc_page_performance(impressions DESC);
CREATE INDEX idx_gsc_page_perf_composite   ON gsc_page_performance(property_id, date DESC, clicks DESC);
CREATE UNIQUE INDEX idx_gsc_page_perf_unique ON gsc_page_performance(property_id, page_url, date, country);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE gsc_oauth_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_properties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_keyword_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_page_performance    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to gsc_oauth_credentials"
  ON gsc_oauth_credentials FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access to gsc_properties"
  ON gsc_properties FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access to gsc_keyword_performance"
  ON gsc_keyword_performance FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin full access to gsc_page_performance"
  ON gsc_page_performance FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- Triggers
-- ============================================================================
CREATE TRIGGER update_gsc_oauth_credentials_updated_at
  BEFORE UPDATE ON gsc_oauth_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gsc_properties_updated_at
  BEFORE UPDATE ON gsc_properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
