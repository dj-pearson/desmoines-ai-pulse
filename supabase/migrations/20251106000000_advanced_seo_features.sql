-- ============================================================================
-- SEO Management System - Advanced SEO Features
-- ============================================================================
-- Description: Advanced SEO analysis tables for comprehensive site auditing
-- Created: 2025-11-06
-- Tables: 4 advanced analysis tables
--   - seo_core_web_vitals: Core Web Vitals metrics tracking
--   - seo_crawl_results: Site crawl results and issues
--   - seo_image_analysis: Image SEO optimization analysis
--   - seo_redirect_analysis: Redirect chain detection and analysis
-- ============================================================================

-- ============================================================================
-- Table: seo_core_web_vitals
-- Purpose: Track Core Web Vitals metrics (LCP, FID, CLS, INP, TTFB, FCP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_core_web_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Measured
  url TEXT NOT NULL,

  -- Device Type
  device TEXT DEFAULT 'mobile' CHECK (device IN ('mobile', 'desktop', 'tablet')),

  -- Connection Type
  connection_type TEXT CHECK (connection_type IN ('4G', '3G', 'slow-3G', 'wifi', 'ethernet')),

  -- Core Web Vitals Metrics
  lcp DECIMAL(10,2), -- Largest Contentful Paint (ms)
  fid DECIMAL(10,2), -- First Input Delay (ms) - deprecated, use INP
  cls DECIMAL(10,4), -- Cumulative Layout Shift (score)
  inp DECIMAL(10,2), -- Interaction to Next Paint (ms) - replaces FID
  ttfb DECIMAL(10,2), -- Time to First Byte (ms)
  fcp DECIMAL(10,2), -- First Contentful Paint (ms)

  -- Performance Scores (0-100)
  performance_score INTEGER CHECK (performance_score >= 0 AND performance_score <= 100),
  lcp_score INTEGER CHECK (lcp_score >= 0 AND lcp_score <= 100),
  fid_score INTEGER CHECK (fid_score >= 0 AND fid_score <= 100),
  cls_score INTEGER CHECK (cls_score >= 0 AND cls_score <= 100),

  -- Overall Assessment
  overall_assessment TEXT CHECK (overall_assessment IN ('good', 'needs_improvement', 'poor')),

  -- Lab Data vs Field Data
  data_source TEXT DEFAULT 'lab' CHECK (data_source IN ('lab', 'field', 'both')),

  -- Additional Metrics
  speed_index DECIMAL(10,2), -- Speed Index (ms)
  time_to_interactive DECIMAL(10,2), -- TTI (ms)
  total_blocking_time DECIMAL(10,2), -- TBT (ms)

  -- Page Weight
  page_size_bytes BIGINT,
  page_size_mb DECIMAL(10,2) GENERATED ALWAYS AS (page_size_bytes / 1048576.0) STORED,

  -- Resource Breakdown
  html_size_bytes BIGINT,
  css_size_bytes BIGINT,
  js_size_bytes BIGINT,
  image_size_bytes BIGINT,
  font_size_bytes BIGINT,
  other_size_bytes BIGINT,

  -- Request Counts
  total_requests INTEGER,
  html_requests INTEGER,
  css_requests INTEGER,
  js_requests INTEGER,
  image_requests INTEGER,
  font_requests INTEGER,

  -- Opportunities (JSONB for detailed recommendations)
  opportunities JSONB, -- [{type, savings_ms, savings_bytes, description}]

  -- Diagnostics
  diagnostics JSONB, -- [{type, severity, description, elements}]

  -- API Response
  pagespeed_api_response JSONB, -- Full API response for reference

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  api_version TEXT, -- PageSpeed Insights API version used
  lighthouse_version TEXT -- Lighthouse version used
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_cwv_url ON seo_core_web_vitals(url);
CREATE INDEX IF NOT EXISTS idx_seo_cwv_device ON seo_core_web_vitals(device);
CREATE INDEX IF NOT EXISTS idx_seo_cwv_checked_at ON seo_core_web_vitals(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_cwv_score ON seo_core_web_vitals(performance_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_cwv_assessment ON seo_core_web_vitals(overall_assessment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_cwv_unique ON seo_core_web_vitals(url, device, checked_at);

-- Comments
COMMENT ON TABLE seo_core_web_vitals IS 'Core Web Vitals metrics tracking from Google PageSpeed Insights';
COMMENT ON COLUMN seo_core_web_vitals.lcp IS 'Largest Contentful Paint - should be under 2.5s for good rating';
COMMENT ON COLUMN seo_core_web_vitals.fid IS 'First Input Delay - should be under 100ms (deprecated, use INP)';
COMMENT ON COLUMN seo_core_web_vitals.cls IS 'Cumulative Layout Shift - should be under 0.1';
COMMENT ON COLUMN seo_core_web_vitals.inp IS 'Interaction to Next Paint - should be under 200ms';

-- ============================================================================
-- Table: seo_crawl_results
-- Purpose: Store results from site crawling operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_crawl_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Crawl Session
  crawl_session_id UUID NOT NULL, -- Group pages from same crawl
  start_url TEXT NOT NULL,

  -- Crawled Page
  url TEXT NOT NULL,
  depth INTEGER DEFAULT 0, -- Depth from start URL

  -- HTTP Response
  status_code INTEGER,
  response_time_ms INTEGER,
  content_type TEXT,
  content_length BIGINT,

  -- Page Content
  title TEXT,
  title_length INTEGER GENERATED ALWAYS AS (char_length(title)) STORED,
  meta_description TEXT,
  meta_description_length INTEGER GENERATED ALWAYS AS (char_length(meta_description)) STORED,

  -- Headings
  h1_tags TEXT[],
  h1_count INTEGER DEFAULT 0,
  h2_count INTEGER DEFAULT 0,
  h3_count INTEGER DEFAULT 0,

  -- Links
  internal_links_count INTEGER DEFAULT 0,
  external_links_count INTEGER DEFAULT 0,
  broken_links_count INTEGER DEFAULT 0,
  broken_links TEXT[], -- URLs of broken links found on this page

  -- Images
  images_count INTEGER DEFAULT 0,
  images_without_alt INTEGER DEFAULT 0,
  oversized_images_count INTEGER DEFAULT 0,

  -- Content Analysis
  word_count INTEGER,
  text_to_html_ratio DECIMAL(5,2), -- Percentage of text vs HTML
  language TEXT,

  -- Technical SEO
  has_canonical BOOLEAN DEFAULT false,
  canonical_url TEXT,
  has_robots_meta BOOLEAN DEFAULT false,
  robots_meta TEXT,
  has_viewport BOOLEAN DEFAULT false,
  has_favicon BOOLEAN DEFAULT false,

  -- Structured Data
  has_structured_data BOOLEAN DEFAULT false,
  structured_data_types TEXT[], -- ['Organization', 'LocalBusiness', 'Event']

  -- Social Meta Tags
  has_og_tags BOOLEAN DEFAULT false,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  has_twitter_tags BOOLEAN DEFAULT false,

  -- Issues Found (JSONB for flexibility)
  issues JSONB, -- [{severity, type, message, details}]
  issue_count INTEGER DEFAULT 0,

  -- SEO Score
  page_seo_score INTEGER CHECK (page_seo_score >= 0 AND page_seo_score <= 100),

  -- Indexability
  is_indexable BOOLEAN DEFAULT true,
  noindex_reason TEXT, -- Why page is not indexable

  -- Metadata
  crawled_at TIMESTAMPTZ DEFAULT now(),
  crawl_duration_ms INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_crawl_session ON seo_crawl_results(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_url ON seo_crawl_results(url);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_status ON seo_crawl_results(status_code);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_crawled_at ON seo_crawl_results(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_score ON seo_crawl_results(page_seo_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_issues ON seo_crawl_results(issue_count DESC);
CREATE INDEX IF NOT EXISTS idx_seo_crawl_broken_links ON seo_crawl_results(broken_links_count) WHERE broken_links_count > 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_crawl_unique ON seo_crawl_results(crawl_session_id, url);

-- Comments
COMMENT ON TABLE seo_crawl_results IS 'Detailed results from site crawling operations';
COMMENT ON COLUMN seo_crawl_results.crawl_session_id IS 'Groups all pages from the same crawl operation';
COMMENT ON COLUMN seo_crawl_results.text_to_html_ratio IS 'Higher ratio generally better for SEO (typically 25-70%)';

-- ============================================================================
-- Table: seo_image_analysis
-- Purpose: Detailed image SEO analysis and optimization recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_image_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page Reference
  page_url TEXT NOT NULL,
  crawl_session_id UUID, -- Link to crawl if part of site crawl

  -- Image Details
  image_url TEXT NOT NULL,
  image_position INTEGER, -- Position on page (1st, 2nd, etc.)

  -- Image Attributes
  alt_text TEXT,
  has_alt_text BOOLEAN GENERATED ALWAYS AS (alt_text IS NOT NULL AND alt_text != '') STORED,
  title_attribute TEXT,
  width INTEGER,
  height INTEGER,
  aspect_ratio DECIMAL(10,2),

  -- File Information
  file_size_bytes BIGINT,
  file_size_kb DECIMAL(10,2) GENERATED ALWAYS AS (file_size_bytes / 1024.0) STORED,
  file_format TEXT, -- jpg, png, webp, svg, gif, etc.
  is_optimized_format BOOLEAN, -- webp or svg preferred

  -- Optimization Analysis
  is_oversized BOOLEAN DEFAULT false, -- File size too large
  recommended_max_size_kb INTEGER, -- Recommended max size based on dimensions
  potential_savings_bytes BIGINT, -- How much could be saved by optimization
  potential_savings_percentage DECIMAL(5,2),

  -- Dimensions Analysis
  is_responsive BOOLEAN, -- Has srcset or picture element
  has_srcset BOOLEAN DEFAULT false,
  has_picture_element BOOLEAN DEFAULT false,
  display_width INTEGER, -- Actual display width
  display_height INTEGER, -- Actual display height
  is_oversized_dimensions BOOLEAN, -- Dimensions larger than display size

  -- Loading Performance
  loading_attribute TEXT, -- 'lazy', 'eager', or null
  is_lazy_loaded BOOLEAN GENERATED ALWAYS AS (loading_attribute = 'lazy') STORED,
  is_above_fold BOOLEAN, -- Should not be lazy-loaded if true

  -- SEO Issues
  issues TEXT[], -- Array of issue descriptions
  issue_severity TEXT CHECK (issue_severity IN ('low', 'medium', 'high', 'critical')),

  -- Recommendations
  recommendations TEXT[], -- Array of optimization recommendations

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_image_page_url ON seo_image_analysis(page_url);
CREATE INDEX IF NOT EXISTS idx_seo_image_url ON seo_image_analysis(image_url);
CREATE INDEX IF NOT EXISTS idx_seo_image_session ON seo_image_analysis(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_seo_image_no_alt ON seo_image_analysis(has_alt_text) WHERE has_alt_text = false;
CREATE INDEX IF NOT EXISTS idx_seo_image_oversized ON seo_image_analysis(is_oversized) WHERE is_oversized = true;
CREATE INDEX IF NOT EXISTS idx_seo_image_format ON seo_image_analysis(file_format);
CREATE INDEX IF NOT EXISTS idx_seo_image_analyzed_at ON seo_image_analysis(analyzed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_image_unique ON seo_image_analysis(page_url, image_url, analyzed_at);

-- Comments
COMMENT ON TABLE seo_image_analysis IS 'Detailed image SEO analysis with optimization recommendations';
COMMENT ON COLUMN seo_image_analysis.potential_savings_bytes IS 'Estimated file size savings through optimization';
COMMENT ON COLUMN seo_image_analysis.is_above_fold IS 'Images above fold should not be lazy-loaded';

-- ============================================================================
-- Table: seo_redirect_analysis
-- Purpose: Detect and analyze redirect chains and loops
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_redirect_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Starting URL
  start_url TEXT NOT NULL,

  -- Final Destination
  final_url TEXT NOT NULL,
  is_redirect BOOLEAN GENERATED ALWAYS AS (start_url != final_url) STORED,

  -- Redirect Chain
  redirect_count INTEGER DEFAULT 0,
  redirect_chain JSONB, -- [{from, to, status_code, type}]
  max_redirects_reached BOOLEAN DEFAULT false,

  -- Redirect Types
  has_301 BOOLEAN DEFAULT false, -- Permanent redirect
  has_302 BOOLEAN DEFAULT false, -- Temporary redirect
  has_307 BOOLEAN DEFAULT false, -- Temporary redirect (POST preserved)
  has_308 BOOLEAN DEFAULT false, -- Permanent redirect (POST preserved)

  -- Redirect Analysis
  is_redirect_loop BOOLEAN DEFAULT false,
  chain_length INTEGER DEFAULT 0, -- Number of hops

  -- Protocol Changes
  http_to_https BOOLEAN DEFAULT false,
  https_to_http BOOLEAN DEFAULT false, -- Security concern!

  -- Domain Changes
  domain_changed BOOLEAN DEFAULT false,
  original_domain TEXT,
  final_domain TEXT,

  -- Performance Impact
  total_redirect_time_ms INTEGER,
  average_redirect_time_ms DECIMAL(10,2),

  -- Issues
  issues TEXT[], -- Array of issues found
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Recommendations
  recommendations TEXT[], -- How to fix redirect issues

  -- SEO Impact Assessment
  seo_impact TEXT CHECK (seo_impact IN ('none', 'minor', 'moderate', 'significant', 'severe')),
  link_equity_loss_percentage DECIMAL(5,2), -- Estimated % of link equity lost

  -- Status
  is_healthy BOOLEAN GENERATED ALWAYS AS (
    redirect_count <= 1 AND
    NOT is_redirect_loop AND
    NOT https_to_http
  ) STORED,

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  crawl_session_id UUID -- If part of site crawl
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_redirect_start_url ON seo_redirect_analysis(start_url);
CREATE INDEX IF NOT EXISTS idx_seo_redirect_final_url ON seo_redirect_analysis(final_url);
CREATE INDEX IF NOT EXISTS idx_seo_redirect_count ON seo_redirect_analysis(redirect_count);
CREATE INDEX IF NOT EXISTS idx_seo_redirect_loop ON seo_redirect_analysis(is_redirect_loop) WHERE is_redirect_loop = true;
CREATE INDEX IF NOT EXISTS idx_seo_redirect_unhealthy ON seo_redirect_analysis(is_healthy) WHERE is_healthy = false;
CREATE INDEX IF NOT EXISTS idx_seo_redirect_severity ON seo_redirect_analysis(severity);
CREATE INDEX IF NOT EXISTS idx_seo_redirect_session ON seo_redirect_analysis(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_seo_redirect_checked_at ON seo_redirect_analysis(checked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_redirect_unique ON seo_redirect_analysis(start_url, checked_at);

-- Comments
COMMENT ON TABLE seo_redirect_analysis IS 'Redirect chain detection and analysis for SEO optimization';
COMMENT ON COLUMN seo_redirect_analysis.redirect_chain IS 'Complete redirect path with status codes';
COMMENT ON COLUMN seo_redirect_analysis.link_equity_loss_percentage IS 'Each redirect in chain loses ~15% link equity';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE seo_core_web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_crawl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_image_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_redirect_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access
-- ============================================================================

CREATE POLICY "Admin full access to seo_core_web_vitals"
  ON seo_core_web_vitals FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_crawl_results"
  ON seo_crawl_results FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_image_analysis"
  ON seo_image_analysis FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_redirect_analysis"
  ON seo_redirect_analysis FOR ALL
  USING (is_admin());

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get Core Web Vitals assessment
CREATE OR REPLACE FUNCTION assess_core_web_vitals(
  p_lcp DECIMAL,
  p_fid DECIMAL,
  p_cls DECIMAL
)
RETURNS TEXT AS $$
DECLARE
  good_count INTEGER := 0;
  poor_count INTEGER := 0;
BEGIN
  -- LCP thresholds: good < 2.5s, poor > 4s
  IF p_lcp IS NOT NULL THEN
    IF p_lcp < 2500 THEN good_count := good_count + 1;
    ELSIF p_lcp > 4000 THEN poor_count := poor_count + 1;
    END IF;
  END IF;

  -- FID thresholds: good < 100ms, poor > 300ms
  IF p_fid IS NOT NULL THEN
    IF p_fid < 100 THEN good_count := good_count + 1;
    ELSIF p_fid > 300 THEN poor_count := poor_count + 1;
    END IF;
  END IF;

  -- CLS thresholds: good < 0.1, poor > 0.25
  IF p_cls IS NOT NULL THEN
    IF p_cls < 0.1 THEN good_count := good_count + 1;
    ELSIF p_cls > 0.25 THEN poor_count := poor_count + 1;
    END IF;
  END IF;

  -- Overall assessment
  IF poor_count > 0 THEN
    RETURN 'poor';
  ELSIF good_count = 3 THEN
    RETURN 'good';
  ELSE
    RETURN 'needs_improvement';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate crawl statistics for a session
CREATE OR REPLACE FUNCTION get_crawl_statistics(p_crawl_session_id UUID)
RETURNS TABLE(
  total_pages INTEGER,
  avg_response_time_ms DECIMAL,
  total_issues INTEGER,
  pages_with_issues INTEGER,
  avg_seo_score DECIMAL,
  total_broken_links INTEGER,
  pages_without_title INTEGER,
  pages_without_description INTEGER,
  images_without_alt INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_pages,
    ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
    SUM(issue_count)::INTEGER as total_issues,
    COUNT(*) FILTER (WHERE issue_count > 0)::INTEGER as pages_with_issues,
    ROUND(AVG(page_seo_score), 2) as avg_seo_score,
    SUM(broken_links_count)::INTEGER as total_broken_links,
    COUNT(*) FILTER (WHERE title IS NULL OR title = '')::INTEGER as pages_without_title,
    COUNT(*) FILTER (WHERE meta_description IS NULL OR meta_description = '')::INTEGER as pages_without_description,
    SUM(images_without_alt)::INTEGER as images_without_alt
  FROM seo_crawl_results
  WHERE crawl_session_id = p_crawl_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find redirect loops
CREATE OR REPLACE FUNCTION find_redirect_loops()
RETURNS TABLE(
  start_url TEXT,
  loop_urls TEXT[],
  checked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.start_url,
    ARRAY(
      SELECT jsonb_array_elements_text(r.redirect_chain -> 'from')
    ) as loop_urls,
    r.checked_at
  FROM seo_redirect_analysis r
  WHERE r.is_redirect_loop = true
  ORDER BY r.checked_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Views for easier data access
-- ============================================================================

-- View: Latest Core Web Vitals by URL
CREATE OR REPLACE VIEW v_latest_core_web_vitals AS
SELECT DISTINCT ON (url, device)
  url,
  device,
  lcp,
  fid,
  cls,
  inp,
  performance_score,
  overall_assessment,
  checked_at
FROM seo_core_web_vitals
ORDER BY url, device, checked_at DESC;

-- View: Pages with Critical Issues from Latest Crawl
CREATE OR REPLACE VIEW v_pages_with_critical_issues AS
WITH latest_crawl AS (
  SELECT DISTINCT ON (url)
    *
  FROM seo_crawl_results
  ORDER BY url, crawled_at DESC
)
SELECT
  url,
  page_seo_score,
  issue_count,
  broken_links_count,
  images_without_alt,
  title,
  meta_description,
  crawled_at
FROM latest_crawl
WHERE issue_count > 0 OR page_seo_score < 50
ORDER BY issue_count DESC, page_seo_score ASC;

-- View: Unhealthy Redirects
CREATE OR REPLACE VIEW v_unhealthy_redirects AS
SELECT
  start_url,
  final_url,
  redirect_count,
  chain_length,
  is_redirect_loop,
  https_to_http,
  severity,
  seo_impact,
  link_equity_loss_percentage,
  checked_at
FROM seo_redirect_analysis
WHERE is_healthy = false
ORDER BY severity DESC, checked_at DESC;

-- Comments on views
COMMENT ON VIEW v_latest_core_web_vitals IS 'Most recent Core Web Vitals metrics for each URL and device';
COMMENT ON VIEW v_pages_with_critical_issues IS 'Pages with critical SEO issues from most recent crawl';
COMMENT ON VIEW v_unhealthy_redirects IS 'Problematic redirects that need attention';

-- ============================================================================
-- End of Migration
-- ============================================================================
