-- ============================================================================
-- SEO Management System - Enterprise SEO Features
-- ============================================================================
-- Description: Enterprise-grade SEO analysis and monitoring tables
-- Created: 2025-11-07
-- Tables: 6 enterprise SEO tables
--   - seo_duplicate_content: Duplicate content detection
--   - seo_security_analysis: Security headers and HTTPS analysis
--   - seo_link_analysis: Internal and external link analysis
--   - seo_structured_data: Structured data validation
--   - seo_mobile_analysis: Mobile-first and responsive analysis
--   - seo_performance_budget: Performance budget tracking
-- ============================================================================

-- ============================================================================
-- Table: seo_duplicate_content
-- Purpose: Detect and track duplicate or similar content across pages
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_duplicate_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary Page
  url_1 TEXT NOT NULL,

  -- Duplicate/Similar Page
  url_2 TEXT NOT NULL,

  -- Similarity Analysis
  similarity_percentage DECIMAL(5,2) CHECK (similarity_percentage >= 0 AND similarity_percentage <= 100),
  similarity_type TEXT CHECK (similarity_type IN ('exact', 'near_duplicate', 'similar', 'partial')),

  -- Content Comparison
  common_text TEXT, -- Sample of matching text
  common_word_count INTEGER,
  total_words_url_1 INTEGER,
  total_words_url_2 INTEGER,

  -- Title and Description Similarity
  title_similarity_percentage DECIMAL(5,2),
  description_similarity_percentage DECIMAL(5,2),
  headings_similarity_percentage DECIMAL(5,2),

  -- SEO Impact
  impact_severity TEXT DEFAULT 'medium' CHECK (impact_severity IN ('low', 'medium', 'high', 'critical')),
  canonical_relationship TEXT CHECK (canonical_relationship IN ('none', 'url_1_canonical', 'url_2_canonical', 'both_canonical_elsewhere')),

  -- Which URL Should Be Canonical
  recommended_canonical TEXT, -- Which URL should be the canonical version
  reason TEXT, -- Why this URL should be canonical

  -- Detection Details
  detection_method TEXT, -- content_hash, fuzzy_match, semantic_analysis
  content_hash_1 TEXT, -- Hash of content for exact duplicate detection
  content_hash_2 TEXT,

  -- Status
  status TEXT DEFAULT 'detected' CHECK (status IN ('detected', 'reviewing', 'resolved', 'false_positive', 'ignored')),
  resolution_action TEXT, -- canonical_added, content_rewritten, page_removed, noindex_added
  resolution_notes TEXT,

  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  last_checked_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_url_1 ON seo_duplicate_content(url_1);
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_url_2 ON seo_duplicate_content(url_2);
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_similarity ON seo_duplicate_content(similarity_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_status ON seo_duplicate_content(status);
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_severity ON seo_duplicate_content(impact_severity);
CREATE INDEX IF NOT EXISTS idx_seo_duplicate_detected_at ON seo_duplicate_content(detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_duplicate_unique ON seo_duplicate_content(url_1, url_2, detected_at);

-- Comments
COMMENT ON TABLE seo_duplicate_content IS 'Duplicate and similar content detection across site pages';
COMMENT ON COLUMN seo_duplicate_content.similarity_percentage IS 'Percentage of content similarity (90%+ is near duplicate)';

-- ============================================================================
-- Table: seo_security_analysis
-- Purpose: Security headers, HTTPS, and security best practices analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_security_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Analyzed
  url TEXT NOT NULL,

  -- HTTPS Analysis
  is_https BOOLEAN DEFAULT false,
  ssl_valid BOOLEAN,
  ssl_issuer TEXT,
  ssl_expiry_date DATE,
  ssl_days_until_expiry INTEGER,
  has_mixed_content BOOLEAN DEFAULT false,
  mixed_content_urls TEXT[], -- URLs loading insecure content

  -- Security Headers
  has_hsts BOOLEAN DEFAULT false, -- HTTP Strict Transport Security
  hsts_max_age INTEGER,
  hsts_include_subdomains BOOLEAN DEFAULT false,
  hsts_preload BOOLEAN DEFAULT false,

  has_csp BOOLEAN DEFAULT false, -- Content Security Policy
  csp_directives JSONB,
  csp_violations TEXT[], -- Potential CSP issues

  has_x_frame_options BOOLEAN DEFAULT false,
  x_frame_options_value TEXT,

  has_x_content_type_options BOOLEAN DEFAULT false,
  x_content_type_options_value TEXT,

  has_referrer_policy BOOLEAN DEFAULT false,
  referrer_policy_value TEXT,

  has_permissions_policy BOOLEAN DEFAULT false,
  permissions_policy_value TEXT,

  -- Security Score (0-100)
  security_score INTEGER CHECK (security_score >= 0 AND security_score <= 100),

  -- Issues Found
  critical_issues TEXT[], -- Critical security issues
  warnings TEXT[], -- Security warnings
  recommendations TEXT[], -- Security recommendations

  -- Vulnerability Analysis
  has_known_vulnerabilities BOOLEAN DEFAULT false,
  vulnerabilities JSONB, -- [{type, severity, description, cve}]

  -- Third-Party Scripts Analysis
  third_party_scripts JSONB, -- [{url, domain, loaded_over_https, has_sri}]
  insecure_third_party_count INTEGER DEFAULT 0,

  -- Cookies Analysis
  cookies JSONB, -- [{name, secure, httponly, samesite, expires}]
  insecure_cookies_count INTEGER DEFAULT 0,

  -- Overall Assessment
  overall_assessment TEXT CHECK (overall_assessment IN ('excellent', 'good', 'needs_improvement', 'poor', 'critical')),

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  crawl_session_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_security_url ON seo_security_analysis(url);
CREATE INDEX IF NOT EXISTS idx_seo_security_https ON seo_security_analysis(is_https);
CREATE INDEX IF NOT EXISTS idx_seo_security_score ON seo_security_analysis(security_score);
CREATE INDEX IF NOT EXISTS idx_seo_security_assessment ON seo_security_analysis(overall_assessment);
CREATE INDEX IF NOT EXISTS idx_seo_security_checked_at ON seo_security_analysis(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_security_vulnerabilities ON seo_security_analysis(has_known_vulnerabilities) WHERE has_known_vulnerabilities = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_security_unique ON seo_security_analysis(url, checked_at);

-- Comments
COMMENT ON TABLE seo_security_analysis IS 'Security headers and HTTPS analysis for SEO and user safety';
COMMENT ON COLUMN seo_security_analysis.hsts_max_age IS 'HSTS max-age in seconds (recommended: 31536000 for 1 year)';

-- ============================================================================
-- Table: seo_link_analysis
-- Purpose: Comprehensive internal and external link analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_link_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source Page
  source_url TEXT NOT NULL,

  -- Link Details
  link_url TEXT NOT NULL,
  link_text TEXT, -- Anchor text
  link_type TEXT CHECK (link_type IN ('internal', 'external', 'subdomain')),

  -- Link Attributes
  is_follow BOOLEAN DEFAULT true, -- Does NOT have rel="nofollow"
  is_nofollow BOOLEAN GENERATED ALWAYS AS (NOT is_follow) STORED,
  rel_attributes TEXT[], -- ['nofollow', 'ugc', 'sponsored', 'external']
  target_attribute TEXT, -- '_blank', '_self', etc.

  -- Link Status
  status_code INTEGER,
  is_broken BOOLEAN GENERATED ALWAYS AS (status_code >= 400) STORED,
  redirect_count INTEGER DEFAULT 0,
  final_url TEXT, -- After following redirects

  -- Link Context
  position_on_page INTEGER, -- Position in the page (1st link, 2nd link, etc.)
  is_in_navigation BOOLEAN DEFAULT false,
  is_in_footer BOOLEAN DEFAULT false,
  is_in_content BOOLEAN DEFAULT true,
  surrounding_text TEXT, -- Text around the link for context

  -- Anchor Text Analysis
  anchor_text_length INTEGER,
  is_exact_match BOOLEAN, -- Exact match keyword in anchor
  is_partial_match BOOLEAN, -- Partial match keyword
  is_branded BOOLEAN, -- Contains brand name
  is_generic BOOLEAN, -- Generic text like "click here", "read more"

  -- SEO Value
  seo_value TEXT DEFAULT 'medium' CHECK (seo_value IN ('high', 'medium', 'low', 'none')),
  passes_link_equity BOOLEAN GENERATED ALWAYS AS (is_follow AND status_code < 400) STORED,

  -- External Link Analysis (for external links)
  domain_authority INTEGER, -- Target domain's authority
  is_reputable_domain BOOLEAN, -- Known reputable source
  is_spam BOOLEAN DEFAULT false,

  -- Response Time
  response_time_ms INTEGER,

  -- Issues
  issues TEXT[], -- ['broken', 'redirect_chain', 'nofollow', 'generic_anchor', 'external_nofollow']

  -- Metadata
  checked_at TIMESTAMPTZ DEFAULT now(),
  crawl_session_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_link_source_url ON seo_link_analysis(source_url);
CREATE INDEX IF NOT EXISTS idx_seo_link_url ON seo_link_analysis(link_url);
CREATE INDEX IF NOT EXISTS idx_seo_link_type ON seo_link_analysis(link_type);
CREATE INDEX IF NOT EXISTS idx_seo_link_broken ON seo_link_analysis(is_broken) WHERE is_broken = true;
CREATE INDEX IF NOT EXISTS idx_seo_link_nofollow ON seo_link_analysis(is_nofollow) WHERE is_nofollow = true;
CREATE INDEX IF NOT EXISTS idx_seo_link_value ON seo_link_analysis(seo_value);
CREATE INDEX IF NOT EXISTS idx_seo_link_checked_at ON seo_link_analysis(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_link_session ON seo_link_analysis(crawl_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_link_unique ON seo_link_analysis(source_url, link_url, checked_at);

-- Comments
COMMENT ON TABLE seo_link_analysis IS 'Comprehensive analysis of internal and external links';
COMMENT ON COLUMN seo_link_analysis.passes_link_equity IS 'True if link is followed and not broken';

-- ============================================================================
-- Table: seo_structured_data
-- Purpose: Validate and track structured data (schema.org) implementation
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_structured_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Analyzed
  url TEXT NOT NULL,

  -- Structured Data Details
  schema_type TEXT NOT NULL, -- Organization, LocalBusiness, Event, Article, Product, etc.
  schema_format TEXT DEFAULT 'JSON-LD' CHECK (schema_format IN ('JSON-LD', 'Microdata', 'RDFa')),

  -- Raw Data
  raw_data JSONB NOT NULL, -- Full structured data

  -- Validation Status
  is_valid BOOLEAN DEFAULT true,
  validation_errors TEXT[], -- Array of validation errors
  validation_warnings TEXT[], -- Array of warnings

  -- Required Properties Check
  has_required_properties BOOLEAN DEFAULT true,
  missing_required_properties TEXT[],

  -- Recommended Properties
  has_recommended_properties BOOLEAN DEFAULT false,
  missing_recommended_properties TEXT[],

  -- Google Rich Results Eligibility
  eligible_for_rich_results BOOLEAN DEFAULT false,
  rich_result_types TEXT[], -- ['Article', 'FAQ', 'Review', 'Product']
  rich_results_issues TEXT[],

  -- Property Analysis
  property_count INTEGER, -- Number of properties in schema
  nested_depth INTEGER, -- How deeply nested the schema is

  -- Specific Schema Checks (for common types)
  -- For LocalBusiness/Organization
  has_name BOOLEAN,
  has_address BOOLEAN,
  has_phone BOOLEAN,
  has_logo BOOLEAN,
  has_opening_hours BOOLEAN,

  -- For Article/BlogPosting
  has_headline BOOLEAN,
  has_author BOOLEAN,
  has_publish_date BOOLEAN,
  has_image BOOLEAN,

  -- For Event
  has_start_date BOOLEAN,
  has_location BOOLEAN,
  has_offer BOOLEAN,

  -- For Product
  has_price BOOLEAN,
  has_availability BOOLEAN,
  has_review BOOLEAN,

  -- Testing Results
  google_testing_url TEXT, -- URL to Google Rich Results Test
  testing_results JSONB, -- Results from testing tools

  -- Metadata
  validated_at TIMESTAMPTZ DEFAULT now(),
  last_modified_at TIMESTAMPTZ,
  crawl_session_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_structured_url ON seo_structured_data(url);
CREATE INDEX IF NOT EXISTS idx_seo_structured_type ON seo_structured_data(schema_type);
CREATE INDEX IF NOT EXISTS idx_seo_structured_valid ON seo_structured_data(is_valid);
CREATE INDEX IF NOT EXISTS idx_seo_structured_rich_results ON seo_structured_data(eligible_for_rich_results) WHERE eligible_for_rich_results = true;
CREATE INDEX IF NOT EXISTS idx_seo_structured_validated_at ON seo_structured_data(validated_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_structured_session ON seo_structured_data(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_seo_structured_unique ON seo_structured_data(url, schema_type, validated_at);

-- Comments
COMMENT ON TABLE seo_structured_data IS 'Structured data (schema.org) validation and analysis';
COMMENT ON COLUMN seo_structured_data.eligible_for_rich_results IS 'Meets requirements for Google Rich Results';

-- ============================================================================
-- Table: seo_mobile_analysis
-- Purpose: Mobile-first indexing and responsive design analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_mobile_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Analyzed
  url TEXT NOT NULL,

  -- Mobile-Friendly Test
  is_mobile_friendly BOOLEAN DEFAULT true,
  mobile_friendly_score INTEGER CHECK (mobile_friendly_score >= 0 AND mobile_friendly_score <= 100),

  -- Viewport Configuration
  has_viewport_meta BOOLEAN DEFAULT false,
  viewport_content TEXT,
  viewport_width TEXT, -- device-width, fixed width, etc.
  viewport_initial_scale DECIMAL(5,2),

  -- Responsive Design
  is_responsive BOOLEAN DEFAULT false,
  responsive_method TEXT CHECK (responsive_method IN ('fluid', 'adaptive', 'separate_mobile', 'none')),

  -- Font and Text
  text_too_small BOOLEAN DEFAULT false,
  text_size_issues TEXT[], -- Areas with text too small
  min_font_size INTEGER, -- Smallest font size in px
  readable_font_size_percentage DECIMAL(5,2), -- % of text with readable size

  -- Touch Elements
  touch_elements_too_close BOOLEAN DEFAULT false,
  touch_target_issues TEXT[], -- Elements with touch targets too small/close
  min_touch_target_size INTEGER, -- Smallest touch target in px
  recommended_touch_target_size INTEGER DEFAULT 48, -- Google recommendation: 48x48px

  -- Content Width
  content_wider_than_screen BOOLEAN DEFAULT false,
  requires_horizontal_scroll BOOLEAN DEFAULT false,
  viewport_width_px INTEGER,
  content_width_px INTEGER,

  -- Mobile Performance
  mobile_page_load_time_ms INTEGER,
  mobile_first_contentful_paint_ms INTEGER,
  mobile_time_to_interactive_ms INTEGER,

  -- Interstitials and Popups
  has_intrusive_interstitials BOOLEAN DEFAULT false,
  interstitial_types TEXT[], -- Types of popups/interstitials found

  -- Mobile Usability Issues
  mobile_usability_issues JSONB, -- [{type, severity, description, elements}]
  critical_issues_count INTEGER DEFAULT 0,
  warning_issues_count INTEGER DEFAULT 0,

  -- Resources Loading
  blocks_mobile_rendering BOOLEAN DEFAULT false,
  blocking_resources TEXT[], -- Scripts/CSS blocking render

  -- Mobile-Specific Features
  has_app_links BOOLEAN DEFAULT false, -- Deep links to mobile app
  has_accelerated_mobile_pages BOOLEAN DEFAULT false, -- AMP implementation
  amp_validation_errors TEXT[],

  -- Google Mobile-First Indexing
  mobile_first_ready BOOLEAN DEFAULT false,
  mobile_first_issues TEXT[],

  -- Comparison with Desktop
  content_parity_with_desktop BOOLEAN, -- Same content as desktop
  missing_content_on_mobile TEXT[], -- Content present on desktop but not mobile

  -- Overall Assessment
  overall_mobile_score INTEGER CHECK (overall_mobile_score >= 0 AND overall_mobile_score <= 100),
  assessment TEXT CHECK (assessment IN ('excellent', 'good', 'needs_improvement', 'poor')),

  -- Recommendations
  recommendations TEXT[],

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  crawl_session_id UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_mobile_url ON seo_mobile_analysis(url);
CREATE INDEX IF NOT EXISTS idx_seo_mobile_friendly ON seo_mobile_analysis(is_mobile_friendly);
CREATE INDEX IF NOT EXISTS idx_seo_mobile_score ON seo_mobile_analysis(overall_mobile_score);
CREATE INDEX IF NOT EXISTS idx_seo_mobile_first_ready ON seo_mobile_analysis(mobile_first_ready);
CREATE INDEX IF NOT EXISTS idx_seo_mobile_assessment ON seo_mobile_analysis(assessment);
CREATE INDEX IF NOT EXISTS idx_seo_mobile_analyzed_at ON seo_mobile_analysis(analyzed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_mobile_unique ON seo_mobile_analysis(url, analyzed_at);

-- Comments
COMMENT ON TABLE seo_mobile_analysis IS 'Mobile-first indexing and responsive design analysis';
COMMENT ON COLUMN seo_mobile_analysis.mobile_first_ready IS 'Ready for Google mobile-first indexing';

-- ============================================================================
-- Table: seo_performance_budget
-- Purpose: Track and monitor performance budgets for pages
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_performance_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL or URL Pattern
  url TEXT,
  url_pattern TEXT, -- Regex pattern for multiple URLs
  applies_to TEXT DEFAULT 'specific' CHECK (applies_to IN ('specific', 'pattern', 'all')),

  -- Budget Name and Description
  budget_name TEXT NOT NULL,
  description TEXT,

  -- Budget Type
  budget_type TEXT CHECK (budget_type IN ('time', 'size', 'requests', 'custom')),

  -- Time Budgets (milliseconds)
  max_load_time_ms INTEGER,
  max_first_contentful_paint_ms INTEGER,
  max_largest_contentful_paint_ms INTEGER,
  max_time_to_interactive_ms INTEGER,
  max_total_blocking_time_ms INTEGER,

  -- Size Budgets (bytes)
  max_total_size_bytes BIGINT,
  max_html_size_bytes BIGINT,
  max_css_size_bytes BIGINT,
  max_js_size_bytes BIGINT,
  max_image_size_bytes BIGINT,
  max_font_size_bytes BIGINT,

  -- Request Count Budgets
  max_total_requests INTEGER,
  max_js_requests INTEGER,
  max_css_requests INTEGER,
  max_image_requests INTEGER,

  -- Core Web Vitals Budgets
  max_lcp_ms INTEGER DEFAULT 2500, -- Good: < 2.5s
  max_fid_ms INTEGER DEFAULT 100,  -- Good: < 100ms
  max_cls DECIMAL(10,4) DEFAULT 0.1, -- Good: < 0.1

  -- Custom Metrics
  custom_metrics JSONB, -- [{name, max_value, current_value, unit}]

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_passing BOOLEAN, -- NULL if not yet checked

  -- Last Check Results
  last_check_results JSONB, -- Detailed results of last budget check
  violations_count INTEGER DEFAULT 0,
  violations TEXT[], -- Which budgets were violated

  -- Alerts
  alert_on_violation BOOLEAN DEFAULT true,
  alert_threshold_percentage INTEGER DEFAULT 90, -- Alert when within X% of budget

  -- History Tracking
  last_checked_at TIMESTAMPTZ,
  last_passed_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_perf_budget_url ON seo_performance_budget(url);
CREATE INDEX IF NOT EXISTS idx_seo_perf_budget_active ON seo_performance_budget(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seo_perf_budget_passing ON seo_performance_budget(is_passing);
CREATE INDEX IF NOT EXISTS idx_seo_perf_budget_violations ON seo_performance_budget(violations_count) WHERE violations_count > 0;
CREATE INDEX IF NOT EXISTS idx_seo_perf_budget_checked_at ON seo_performance_budget(last_checked_at DESC);

-- Comments
COMMENT ON TABLE seo_performance_budget IS 'Performance budget tracking and monitoring';
COMMENT ON COLUMN seo_performance_budget.alert_threshold_percentage IS 'Alert when within this percentage of budget limit';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE seo_duplicate_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_security_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_link_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_structured_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_mobile_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_performance_budget ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access
-- ============================================================================

CREATE POLICY "Admin full access to seo_duplicate_content"
  ON seo_duplicate_content FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_security_analysis"
  ON seo_security_analysis FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_link_analysis"
  ON seo_link_analysis FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_structured_data"
  ON seo_structured_data FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_mobile_analysis"
  ON seo_mobile_analysis FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_performance_budget"
  ON seo_performance_budget FOR ALL
  USING (is_admin());

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER update_seo_performance_budget_updated_at
  BEFORE UPDATE ON seo_performance_budget
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to check performance budget violations
CREATE OR REPLACE FUNCTION check_performance_budget(
  p_budget_id UUID,
  p_actual_metrics JSONB
)
RETURNS JSONB AS $$
DECLARE
  budget RECORD;
  violations TEXT[] := '{}';
  is_passing BOOLEAN := true;
  result JSONB;
BEGIN
  SELECT * INTO budget FROM seo_performance_budget WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget not found';
  END IF;

  -- Check time budgets
  IF budget.max_load_time_ms IS NOT NULL AND (p_actual_metrics->>'load_time_ms')::INTEGER > budget.max_load_time_ms THEN
    violations := array_append(violations, 'Page load time exceeds budget');
    is_passing := false;
  END IF;

  -- Check size budgets
  IF budget.max_total_size_bytes IS NOT NULL AND (p_actual_metrics->>'total_size_bytes')::BIGINT > budget.max_total_size_bytes THEN
    violations := array_append(violations, 'Total page size exceeds budget');
    is_passing := false;
  END IF;

  -- Check LCP
  IF budget.max_lcp_ms IS NOT NULL AND (p_actual_metrics->>'lcp_ms')::INTEGER > budget.max_lcp_ms THEN
    violations := array_append(violations, 'LCP exceeds budget');
    is_passing := false;
  END IF;

  -- Update budget record
  UPDATE seo_performance_budget
  SET
    is_passing = is_passing,
    violations = violations,
    violations_count = array_length(violations, 1),
    last_check_results = p_actual_metrics,
    last_checked_at = now(),
    last_passed_at = CASE WHEN is_passing THEN now() ELSE last_passed_at END,
    last_failed_at = CASE WHEN NOT is_passing THEN now() ELSE last_failed_at END,
    consecutive_failures = CASE WHEN is_passing THEN 0 ELSE consecutive_failures + 1 END
  WHERE id = p_budget_id;

  result := jsonb_build_object(
    'is_passing', is_passing,
    'violations', violations,
    'violations_count', array_length(violations, 1)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Views
-- ============================================================================

-- View: Duplicate Content Summary
CREATE OR REPLACE VIEW v_duplicate_content_summary AS
SELECT
  url_1,
  COUNT(*) as duplicate_count,
  AVG(similarity_percentage) as avg_similarity,
  MAX(similarity_percentage) as max_similarity,
  MAX(detected_at) as last_detected
FROM seo_duplicate_content
WHERE status = 'detected'
GROUP BY url_1
ORDER BY duplicate_count DESC;

-- View: Broken Links Summary
CREATE OR REPLACE VIEW v_broken_links_summary AS
SELECT
  source_url,
  COUNT(*) as broken_links_count,
  array_agg(link_url) as broken_urls,
  MAX(checked_at) as last_checked
FROM seo_link_analysis
WHERE is_broken = true
GROUP BY source_url
ORDER BY broken_links_count DESC;

-- Comments
COMMENT ON VIEW v_duplicate_content_summary IS 'Summary of pages with duplicate content issues';
COMMENT ON VIEW v_broken_links_summary IS 'Summary of pages with broken links';

-- ============================================================================
-- End of Migration
-- ============================================================================
