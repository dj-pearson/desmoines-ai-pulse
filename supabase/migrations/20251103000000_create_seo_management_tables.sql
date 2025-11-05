-- ============================================================================
-- SEO Management System - Core Tables
-- ============================================================================
-- Description: Core SEO management tables for comprehensive site optimization
-- Created: 2025-11-03
-- Tables: 8 core SEO tables
--   - seo_settings: Global SEO configuration
--   - seo_audit_history: Audit results history
--   - seo_fixes_applied: Track applied SEO fixes
--   - seo_keywords: Keyword tracking and monitoring
--   - seo_keyword_history: Historical keyword performance
--   - seo_competitor_analysis: Competitor SEO metrics
--   - seo_page_scores: Individual page SEO scores
--   - seo_monitoring_log: Continuous monitoring logs
-- ============================================================================

-- ============================================================================
-- Table: seo_settings
-- Purpose: Global SEO configuration and meta tags
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Meta Tags
  site_title TEXT,
  site_description TEXT CHECK (char_length(site_description) <= 160),
  default_keywords TEXT[],

  -- Social Media
  og_image_url TEXT,
  twitter_handle TEXT,
  facebook_app_id TEXT,

  -- Technical SEO
  robots_txt TEXT,
  canonical_domain TEXT,
  sitemap_url TEXT,

  -- Advanced Settings
  structured_data_enabled BOOLEAN DEFAULT true,
  auto_generate_seo BOOLEAN DEFAULT false,
  monitoring_enabled BOOLEAN DEFAULT false,
  monitoring_interval_minutes INTEGER DEFAULT 60,

  -- Schema.org Configuration
  organization_name TEXT,
  organization_logo TEXT,
  organization_url TEXT,

  -- Analytics
  google_analytics_id TEXT,
  google_search_console_property TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_seo_settings_updated_at ON seo_settings(updated_at DESC);

-- Comments
COMMENT ON TABLE seo_settings IS 'Global SEO configuration and default meta tags';
COMMENT ON COLUMN seo_settings.site_description IS 'Must be under 160 characters for optimal display';
COMMENT ON COLUMN seo_settings.monitoring_interval_minutes IS 'How often to run automated SEO checks (in minutes)';

-- ============================================================================
-- Table: seo_audit_history
-- Purpose: Store complete audit results with scores and recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_audit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Audit Details
  url TEXT NOT NULL,
  audit_type TEXT DEFAULT 'full', -- full, quick, technical, content

  -- Scores (0-100)
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  technical_score INTEGER CHECK (technical_score >= 0 AND technical_score <= 100),
  content_score INTEGER CHECK (content_score >= 0 AND content_score <= 100),
  performance_score INTEGER CHECK (performance_score >= 0 AND performance_score <= 100),
  accessibility_score INTEGER CHECK (accessibility_score >= 0 AND accessibility_score <= 100),

  -- Issues Found
  critical_issues INTEGER DEFAULT 0,
  warning_issues INTEGER DEFAULT 0,
  info_issues INTEGER DEFAULT 0,

  -- Detailed Results (JSONB for flexibility)
  meta_tags JSONB, -- {title, description, keywords, og_tags, twitter_tags}
  headings JSONB, -- {h1: [], h2: [], h3: [], issues: []}
  images JSONB, -- {total, missing_alt, oversized, issues: []}
  links JSONB, -- {internal: count, external: count, broken: [], nofollow: []}
  performance JSONB, -- {page_size, load_time, requests, issues: []}
  mobile JSONB, -- {responsive, viewport, font_size, tap_targets}
  structured_data JSONB, -- {valid: [], invalid: [], warnings: []}
  security JSONB, -- {https, headers, issues: []}

  -- Recommendations
  recommendations JSONB, -- [{priority, category, title, description, fix}]

  -- Execution Details
  execution_time_ms INTEGER,
  pages_crawled INTEGER DEFAULT 1,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  triggered_by UUID REFERENCES auth.users(id),
  is_automated BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_audit_history_url ON seo_audit_history(url);
CREATE INDEX IF NOT EXISTS idx_seo_audit_history_created_at ON seo_audit_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_audit_history_overall_score ON seo_audit_history(overall_score);
CREATE INDEX IF NOT EXISTS idx_seo_audit_history_automated ON seo_audit_history(is_automated, created_at DESC);

-- Comments
COMMENT ON TABLE seo_audit_history IS 'Complete SEO audit results with detailed scores and recommendations';
COMMENT ON COLUMN seo_audit_history.recommendations IS 'Array of actionable recommendations with priority levels';

-- ============================================================================
-- Table: seo_fixes_applied
-- Purpose: Track which SEO fixes have been applied and their impact
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_fixes_applied (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fix Details
  audit_id UUID REFERENCES seo_audit_history(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  issue_type TEXT NOT NULL, -- meta_tags, headings, images, links, performance, etc.
  issue_severity TEXT CHECK (issue_severity IN ('critical', 'warning', 'info')),

  -- Fix Information
  fix_description TEXT NOT NULL,
  fix_type TEXT, -- manual, automated, ai_suggested
  old_value TEXT,
  new_value TEXT,

  -- Status Tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'verified', 'reverted', 'failed')),
  applied_method TEXT, -- ui, api, script

  -- Impact Measurement
  score_before INTEGER,
  score_after INTEGER,
  impact_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_fixes_url ON seo_fixes_applied(url);
CREATE INDEX IF NOT EXISTS idx_seo_fixes_status ON seo_fixes_applied(status);
CREATE INDEX IF NOT EXISTS idx_seo_fixes_created_at ON seo_fixes_applied(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_fixes_audit_id ON seo_fixes_applied(audit_id);

-- Comments
COMMENT ON TABLE seo_fixes_applied IS 'Track SEO fixes applied and measure their impact';
COMMENT ON COLUMN seo_fixes_applied.impact_notes IS 'Notes on the measured impact after applying fix';

-- ============================================================================
-- Table: seo_keywords
-- Purpose: Track target keywords and their rankings
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Keyword Details
  keyword TEXT NOT NULL,
  target_url TEXT NOT NULL,
  search_volume INTEGER, -- Monthly search volume
  difficulty INTEGER CHECK (difficulty >= 0 AND difficulty <= 100), -- Keyword difficulty 0-100

  -- Tracking Configuration
  is_primary BOOLEAN DEFAULT false, -- Primary keyword for the page
  target_position INTEGER DEFAULT 1, -- Desired ranking position
  language TEXT DEFAULT 'en',
  country_code TEXT DEFAULT 'US',

  -- Current Performance
  current_position INTEGER,
  previous_position INTEGER,
  best_position INTEGER,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2), -- Click-through rate

  -- Change Tracking
  position_change INTEGER, -- Calculated: previous_position - current_position
  last_checked_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking', 'paused', 'achieved', 'lost')),

  -- Competitor Analysis
  competitor_urls TEXT[], -- Top ranking competitor URLs

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_keywords_keyword ON seo_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_url ON seo_keywords(target_url);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_position ON seo_keywords(current_position);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_status ON seo_keywords(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_keywords_unique ON seo_keywords(keyword, target_url, country_code);

-- Comments
COMMENT ON TABLE seo_keywords IS 'Target keywords with ranking tracking and performance metrics';
COMMENT ON COLUMN seo_keywords.position_change IS 'Positive value means improved ranking';

-- ============================================================================
-- Table: seo_keyword_history
-- Purpose: Historical keyword position tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_keyword_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  keyword_id UUID NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,

  -- Performance Snapshot
  position INTEGER,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2),

  -- Additional Metrics
  page_rank DECIMAL(5,2), -- PageRank score if available
  domain_authority INTEGER, -- DA score if available

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_keyword_history_keyword_id ON seo_keyword_history(keyword_id);
CREATE INDEX IF NOT EXISTS idx_seo_keyword_history_checked_at ON seo_keyword_history(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_keyword_history_composite ON seo_keyword_history(keyword_id, checked_at DESC);

-- Comments
COMMENT ON TABLE seo_keyword_history IS 'Historical tracking of keyword positions over time';

-- ============================================================================
-- Table: seo_competitor_analysis
-- Purpose: Track competitor SEO metrics and strategies
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_competitor_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Competitor Details
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,

  -- SEO Metrics
  domain_authority INTEGER CHECK (domain_authority >= 0 AND domain_authority <= 100),
  page_authority INTEGER CHECK (page_authority >= 0 AND page_authority <= 100),
  organic_keywords INTEGER, -- Estimated organic keywords ranking
  organic_traffic INTEGER, -- Estimated monthly organic traffic
  backlinks_count INTEGER,
  referring_domains INTEGER,

  -- Content Analysis
  pages_count INTEGER,
  blog_posts_count INTEGER,
  avg_content_length INTEGER,
  content_update_frequency TEXT, -- daily, weekly, monthly

  -- Technical SEO
  mobile_friendly BOOLEAN,
  https_enabled BOOLEAN,
  page_speed_score INTEGER CHECK (page_speed_score >= 0 AND page_speed_score <= 100),

  -- Ranking Comparison
  shared_keywords INTEGER, -- Keywords both sites rank for
  keywords_they_win INTEGER, -- Keywords competitor ranks higher
  keywords_we_win INTEGER, -- Keywords we rank higher

  -- Strategy Insights
  top_content_topics TEXT[],
  link_building_strategy TEXT,
  social_media_presence JSONB, -- {facebook, twitter, linkedin, instagram}

  -- Detailed Analysis (JSONB)
  top_pages JSONB, -- [{url, traffic, keywords, backlinks}]
  keyword_gaps JSONB, -- Keywords they rank for but we don't
  backlink_sources JSONB, -- [{domain, authority, links}]

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  next_analysis_at TIMESTAMPTZ,
  analysis_frequency_days INTEGER DEFAULT 30,
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_competitor_url ON seo_competitor_analysis(competitor_url);
CREATE INDEX IF NOT EXISTS idx_seo_competitor_analyzed_at ON seo_competitor_analysis(analyzed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_competitor_unique ON seo_competitor_analysis(competitor_url, analyzed_at);

-- Comments
COMMENT ON TABLE seo_competitor_analysis IS 'Comprehensive competitor SEO analysis and tracking';
COMMENT ON COLUMN seo_competitor_analysis.keyword_gaps IS 'Keywords competitors rank for that we should target';

-- ============================================================================
-- Table: seo_page_scores
-- Purpose: Individual page SEO scores and optimization status
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_page_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page Details
  url TEXT NOT NULL,
  page_type TEXT, -- homepage, article, product, category, etc.

  -- SEO Scores (0-100)
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  title_score INTEGER CHECK (title_score >= 0 AND title_score <= 100),
  description_score INTEGER CHECK (description_score >= 0 AND description_score <= 100),
  content_score INTEGER CHECK (content_score >= 0 AND content_score <= 100),
  heading_score INTEGER CHECK (heading_score >= 0 AND heading_score <= 100),
  image_score INTEGER CHECK (image_score >= 0 AND image_score <= 100),
  link_score INTEGER CHECK (link_score >= 0 AND link_score <= 100),

  -- Optimization Status
  is_optimized BOOLEAN DEFAULT false,
  needs_attention BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  -- Issues Found
  issues_found TEXT[], -- Array of issue descriptions
  optimization_suggestions TEXT[], -- Array of actionable suggestions

  -- Content Metrics
  word_count INTEGER,
  readability_score DECIMAL(5,2),
  keyword_density JSONB, -- {keyword: percentage}

  -- Technical Metrics
  load_time_ms INTEGER,
  response_code INTEGER,

  -- Metadata
  last_scanned_at TIMESTAMPTZ DEFAULT now(),
  last_optimized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_page_scores_url ON seo_page_scores(url);
CREATE INDEX IF NOT EXISTS idx_seo_page_scores_overall_score ON seo_page_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_seo_page_scores_priority ON seo_page_scores(priority);
CREATE INDEX IF NOT EXISTS idx_seo_page_scores_needs_attention ON seo_page_scores(needs_attention) WHERE needs_attention = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_page_scores_unique ON seo_page_scores(url, last_scanned_at);

-- Comments
COMMENT ON TABLE seo_page_scores IS 'Individual page SEO scores and optimization tracking';
COMMENT ON COLUMN seo_page_scores.readability_score IS 'Readability score (Flesch Reading Ease or similar)';

-- ============================================================================
-- Table: seo_monitoring_log
-- Purpose: Log all automated monitoring activities
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_monitoring_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Monitoring Details
  monitoring_type TEXT NOT NULL, -- audit, keyword_check, uptime, performance, etc.
  url TEXT,

  -- Status
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error', 'skipped')),

  -- Results Summary
  issues_found INTEGER DEFAULT 0,
  alerts_triggered INTEGER DEFAULT 0,

  -- Details (JSONB for flexibility)
  details JSONB,
  error_message TEXT,

  -- Execution Info
  execution_time_ms INTEGER,

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  next_check_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_log_checked_at ON seo_monitoring_log(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_log_status ON seo_monitoring_log(status);
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_log_type ON seo_monitoring_log(monitoring_type);
CREATE INDEX IF NOT EXISTS idx_seo_monitoring_log_url ON seo_monitoring_log(url);

-- Comments
COMMENT ON TABLE seo_monitoring_log IS 'Log of all automated SEO monitoring activities';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_audit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_fixes_applied ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keyword_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_competitor_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_page_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_monitoring_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access for all SEO tables
-- Pattern: Check if user has 'admin' or 'root_admin' role
-- ============================================================================

-- Helper function to check if user is admin (reuse if exists)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- seo_settings policies
CREATE POLICY "Admin full access to seo_settings"
  ON seo_settings FOR ALL
  USING (is_admin());

-- seo_audit_history policies
CREATE POLICY "Admin full access to seo_audit_history"
  ON seo_audit_history FOR ALL
  USING (is_admin());

-- seo_fixes_applied policies
CREATE POLICY "Admin full access to seo_fixes_applied"
  ON seo_fixes_applied FOR ALL
  USING (is_admin());

-- seo_keywords policies
CREATE POLICY "Admin full access to seo_keywords"
  ON seo_keywords FOR ALL
  USING (is_admin());

-- seo_keyword_history policies
CREATE POLICY "Admin full access to seo_keyword_history"
  ON seo_keyword_history FOR ALL
  USING (is_admin());

-- seo_competitor_analysis policies
CREATE POLICY "Admin full access to seo_competitor_analysis"
  ON seo_competitor_analysis FOR ALL
  USING (is_admin());

-- seo_page_scores policies
CREATE POLICY "Admin full access to seo_page_scores"
  ON seo_page_scores FOR ALL
  USING (is_admin());

-- seo_monitoring_log policies
CREATE POLICY "Admin full access to seo_monitoring_log"
  ON seo_monitoring_log FOR ALL
  USING (is_admin());

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================

-- Trigger function for updated_at (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_seo_settings_updated_at
  BEFORE UPDATE ON seo_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_keywords_updated_at
  BEFORE UPDATE ON seo_keywords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to calculate keyword position change
CREATE OR REPLACE FUNCTION calculate_keyword_position_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_position IS NOT NULL AND OLD.current_position IS NOT NULL THEN
    NEW.position_change := OLD.current_position - NEW.current_position;
    NEW.previous_position := OLD.current_position;

    -- Update best position if improved
    IF NEW.best_position IS NULL OR NEW.current_position < NEW.best_position THEN
      NEW.best_position := NEW.current_position;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_keyword_position_change
  BEFORE UPDATE ON seo_keywords
  FOR EACH ROW
  WHEN (OLD.current_position IS DISTINCT FROM NEW.current_position)
  EXECUTE FUNCTION calculate_keyword_position_change();

-- ============================================================================
-- Initial Data: Create default SEO settings entry
-- ============================================================================
INSERT INTO seo_settings (
  site_title,
  site_description,
  structured_data_enabled,
  auto_generate_seo,
  monitoring_enabled,
  monitoring_interval_minutes
) VALUES (
  'Des Moines AI Pulse',
  'Your comprehensive guide to events, dining, and attractions in Des Moines, Iowa',
  true,
  false,
  false,
  60
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of Migration
-- ============================================================================
