-- ============================================================================
-- SEO Management System - Content Optimization Features
-- ============================================================================
-- Description: AI-powered content optimization and semantic analysis
-- Created: 2025-11-08
-- Tables: 2 content optimization tables
--   - seo_content_optimization: Content quality and optimization tracking
--   - seo_semantic_analysis: Semantic keyword and topic analysis
-- ============================================================================

-- ============================================================================
-- Table: seo_content_optimization
-- Purpose: Content quality analysis and AI-powered optimization recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_content_optimization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Analyzed
  url TEXT NOT NULL,

  -- Content Details
  title TEXT,
  meta_description TEXT,
  h1 TEXT,

  -- Content Metrics
  word_count INTEGER,
  character_count INTEGER,
  paragraph_count INTEGER,
  sentence_count INTEGER,
  average_words_per_sentence DECIMAL(5,2),

  -- Readability Analysis
  readability_score DECIMAL(5,2), -- Flesch Reading Ease (0-100, higher is easier)
  readability_grade_level TEXT, -- '6th grade', '9th grade', 'College', etc.
  reading_time_minutes INTEGER, -- Estimated reading time

  -- Content Quality Scores (0-100)
  overall_content_score INTEGER CHECK (overall_content_score >= 0 AND overall_content_score <= 100),
  keyword_optimization_score INTEGER CHECK (keyword_optimization_score >= 0 AND keyword_optimization_score <= 100),
  readability_score_rating INTEGER CHECK (readability_score_rating >= 0 AND readability_score_rating <= 100),
  structure_score INTEGER CHECK (structure_score >= 0 AND structure_score <= 100),
  engagement_score INTEGER CHECK (engagement_score >= 0 AND engagement_score <= 100),

  -- Keyword Analysis
  target_keyword TEXT,
  keyword_density DECIMAL(5,2), -- Percentage
  keyword_in_title BOOLEAN DEFAULT false,
  keyword_in_description BOOLEAN DEFAULT false,
  keyword_in_h1 BOOLEAN DEFAULT false,
  keyword_in_first_paragraph BOOLEAN DEFAULT false,
  keyword_frequency INTEGER,

  -- LSI Keywords (Latent Semantic Indexing)
  lsi_keywords TEXT[], -- Related keywords found
  lsi_keywords_count INTEGER,
  missing_lsi_keywords TEXT[], -- Recommended LSI keywords missing

  -- Content Structure
  has_introduction BOOLEAN DEFAULT false,
  has_conclusion BOOLEAN DEFAULT false,
  has_call_to_action BOOLEAN DEFAULT false,
  has_table_of_contents BOOLEAN DEFAULT false,
  has_lists BOOLEAN DEFAULT false, -- Bulleted or numbered lists
  has_images BOOLEAN DEFAULT false,
  has_videos BOOLEAN DEFAULT false,

  -- Heading Structure
  heading_structure_valid BOOLEAN DEFAULT true,
  heading_hierarchy_issues TEXT[], -- Issues with h1, h2, h3 hierarchy

  -- Engagement Elements
  internal_links_count INTEGER DEFAULT 0,
  external_links_count INTEGER DEFAULT 0,
  images_count INTEGER DEFAULT 0,
  has_featured_image BOOLEAN DEFAULT false,

  -- Content Type Classification
  content_type TEXT, -- article, guide, listicle, how-to, review, comparison
  content_intent TEXT CHECK (content_intent IN ('informational', 'navigational', 'transactional', 'commercial')),

  -- Freshness
  content_age_days INTEGER,
  is_evergreen BOOLEAN, -- Content that remains relevant
  last_updated_date DATE,
  update_frequency TEXT, -- daily, weekly, monthly, yearly, never

  -- Issues and Recommendations
  issues JSONB, -- [{severity, category, issue, suggestion}]
  issues_count INTEGER DEFAULT 0,

  -- AI-Generated Recommendations
  ai_recommendations JSONB, -- [{priority, category, recommendation, implementation}]
  ai_model_used TEXT, -- Which AI model generated recommendations
  ai_analysis_date TIMESTAMPTZ,

  -- Suggested Improvements
  suggested_title TEXT,
  suggested_meta_description TEXT,
  suggested_h1 TEXT,
  suggested_content_additions TEXT[], -- Topics/sections to add
  suggested_content_length_words INTEGER,

  -- Competitor Comparison
  competitor_average_word_count INTEGER,
  competitor_average_score INTEGER,
  content_gap_topics TEXT[], -- Topics competitors cover that we don't

  -- User Engagement Metrics (if available)
  average_time_on_page_seconds INTEGER,
  bounce_rate_percentage DECIMAL(5,2),
  conversion_rate_percentage DECIMAL(5,2),

  -- Optimization Status
  optimization_status TEXT DEFAULT 'needs_optimization' CHECK (optimization_status IN (
    'optimized', 'needs_optimization', 'in_progress', 'not_started'
  )),
  optimization_priority TEXT DEFAULT 'medium' CHECK (optimization_priority IN ('low', 'medium', 'high', 'critical')),

  -- Implementation Tracking
  recommendations_implemented INTEGER DEFAULT 0,
  recommendations_total INTEGER,
  implementation_progress_percentage DECIMAL(5,2),

  -- Performance Tracking
  score_before_optimization INTEGER,
  score_after_optimization INTEGER,
  improvement_percentage DECIMAL(5,2),

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  last_optimized_at TIMESTAMPTZ,
  optimized_by UUID REFERENCES auth.users(id),
  next_review_date DATE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_url ON seo_content_optimization(url);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_score ON seo_content_optimization(overall_content_score);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_status ON seo_content_optimization(optimization_status);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_priority ON seo_content_optimization(optimization_priority);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_keyword ON seo_content_optimization(target_keyword);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_analyzed_at ON seo_content_optimization(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_content_opt_next_review ON seo_content_optimization(next_review_date) WHERE next_review_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_content_opt_unique ON seo_content_optimization(url, analyzed_at);

-- Comments
COMMENT ON TABLE seo_content_optimization IS 'Content quality analysis and AI-powered optimization recommendations';
COMMENT ON COLUMN seo_content_optimization.readability_score IS 'Flesch Reading Ease: 90-100=5th grade, 60-70=8th-9th grade, 0-30=college graduate';
COMMENT ON COLUMN seo_content_optimization.lsi_keywords IS 'Latent Semantic Indexing keywords - related terms that support main keyword';

-- ============================================================================
-- Table: seo_semantic_analysis
-- Purpose: Semantic keyword analysis and topic modeling
-- ============================================================================
CREATE TABLE IF NOT EXISTS seo_semantic_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL Being Analyzed
  url TEXT NOT NULL,

  -- Primary Keyword
  primary_keyword TEXT NOT NULL,

  -- Semantic Analysis
  semantic_keywords JSONB, -- [{keyword, relevance_score, frequency, context}]
  semantic_keywords_count INTEGER,

  -- Topic Clusters
  topic_clusters JSONB, -- [{topic, keywords[], relevance_score, coverage_percentage}]
  main_topics TEXT[], -- Primary topics covered
  subtopics TEXT[], -- Subtopics covered

  -- Entity Recognition
  entities JSONB, -- [{entity, type, frequency, context}]
  -- Types: PERSON, ORGANIZATION, LOCATION, DATE, PRODUCT, etc.
  entities_count INTEGER,

  -- Search Intent Analysis
  detected_intent TEXT CHECK (detected_intent IN (
    'informational',    -- User wants to learn
    'navigational',     -- User wants to find specific site
    'transactional',    -- User wants to buy/do something
    'commercial'        -- User researching before buying
  )),
  intent_confidence DECIMAL(5,2), -- Confidence score 0-100

  -- Query Variations
  query_variations TEXT[], -- Different ways users might search
  long_tail_keywords TEXT[], -- Long-tail keyword opportunities
  question_keywords TEXT[], -- Question-based keywords (who, what, where, when, why, how)

  -- Semantic Richness
  semantic_richness_score INTEGER CHECK (semantic_richness_score >= 0 AND semantic_richness_score <= 100),
  topic_depth_score INTEGER CHECK (topic_depth_score >= 0 AND topic_depth_score <= 100),
  content_comprehensiveness_score INTEGER CHECK (content_comprehensiveness_score >= 0 AND content_comprehensiveness_score <= 100),

  -- Related Queries (from search engines)
  related_searches TEXT[], -- "People also search for" queries
  questions_people_ask TEXT[], -- "People also ask" questions
  auto_suggest_queries TEXT[], -- Google autocomplete suggestions

  -- Content Gaps
  missing_topics TEXT[], -- Topics competitors cover that we don't
  missing_keywords TEXT[], -- Keywords competitors rank for that we don't
  recommended_content_additions TEXT[], -- Sections/topics to add

  -- Competitor Semantic Analysis
  competitor_semantic_overlap_percentage DECIMAL(5,2),
  unique_semantic_keywords TEXT[], -- Keywords we cover that competitors don't
  competitor_semantic_keywords TEXT[], -- Keywords competitors cover that we don't

  -- AI Analysis
  ai_topic_suggestions TEXT[], -- AI-suggested topics to cover
  ai_keyword_suggestions TEXT[], -- AI-suggested keywords to target
  ai_content_angle_suggestions TEXT[], -- Unique angles for content
  ai_model_used TEXT,

  -- Natural Language Processing
  sentiment_score DECIMAL(5,2), -- -1 to 1 (negative to positive)
  tone TEXT, -- formal, casual, technical, friendly, authoritative
  complexity_level TEXT, -- beginner, intermediate, advanced, expert

  -- TF-IDF Analysis (Term Frequency-Inverse Document Frequency)
  tfidf_top_terms JSONB, -- [{term, tfidf_score, frequency}]

  -- Co-occurrence Analysis
  keyword_co_occurrences JSONB, -- [{keyword_1, keyword_2, co_occurrence_count, relevance}]

  -- Search Feature Opportunities
  featured_snippet_opportunity BOOLEAN DEFAULT false,
  featured_snippet_type TEXT, -- paragraph, list, table, video
  paa_opportunity BOOLEAN DEFAULT false, -- People Also Ask
  paa_questions TEXT[], -- Questions to target

  -- SERP Analysis
  serp_keyword_density_competitors DECIMAL(5,2), -- Average keyword density of top 10
  serp_avg_word_count INTEGER, -- Average word count of top 10
  serp_common_topics TEXT[], -- Topics commonly covered by top 10

  -- Optimization Recommendations
  semantic_optimization_recommendations TEXT[],
  priority_keywords_to_add TEXT[],
  priority_topics_to_cover TEXT[],

  -- Performance Tracking
  semantic_score_before INTEGER,
  semantic_score_after INTEGER,
  ranking_improvement INTEGER, -- Position improvement after optimization

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ,
  next_analysis_date DATE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_semantic_url ON seo_semantic_analysis(url);
CREATE INDEX IF NOT EXISTS idx_seo_semantic_keyword ON seo_semantic_analysis(primary_keyword);
CREATE INDEX IF NOT EXISTS idx_seo_semantic_intent ON seo_semantic_analysis(detected_intent);
CREATE INDEX IF NOT EXISTS idx_seo_semantic_richness ON seo_semantic_analysis(semantic_richness_score);
CREATE INDEX IF NOT EXISTS idx_seo_semantic_snippet_opp ON seo_semantic_analysis(featured_snippet_opportunity) WHERE featured_snippet_opportunity = true;
CREATE INDEX IF NOT EXISTS idx_seo_semantic_analyzed_at ON seo_semantic_analysis(analyzed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_semantic_unique ON seo_semantic_analysis(url, primary_keyword, analyzed_at);

-- Comments
COMMENT ON TABLE seo_semantic_analysis IS 'Semantic keyword analysis and topic modeling for content optimization';
COMMENT ON COLUMN seo_semantic_analysis.tfidf_top_terms IS 'Term Frequency-Inverse Document Frequency scores for important terms';
COMMENT ON COLUMN seo_semantic_analysis.featured_snippet_opportunity IS 'Content structure suitable for featured snippet';

-- ============================================================================
-- Enable Row Level Security (RLS) on all tables
-- ============================================================================
ALTER TABLE seo_content_optimization ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_semantic_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: Admin-only access
-- ============================================================================

CREATE POLICY "Admin full access to seo_content_optimization"
  ON seo_content_optimization FOR ALL
  USING (is_admin());

CREATE POLICY "Admin full access to seo_semantic_analysis"
  ON seo_semantic_analysis FOR ALL
  USING (is_admin());

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to calculate Flesch Reading Ease score
CREATE OR REPLACE FUNCTION calculate_flesch_reading_ease(
  p_total_words INTEGER,
  p_total_sentences INTEGER,
  p_total_syllables INTEGER
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  words_per_sentence DECIMAL;
  syllables_per_word DECIMAL;
  score DECIMAL;
BEGIN
  IF p_total_sentences = 0 OR p_total_words = 0 THEN
    RETURN NULL;
  END IF;

  words_per_sentence := p_total_words::DECIMAL / p_total_sentences::DECIMAL;
  syllables_per_word := p_total_syllables::DECIMAL / p_total_words::DECIMAL;

  -- Flesch Reading Ease formula
  score := 206.835 - (1.015 * words_per_sentence) - (84.6 * syllables_per_word);

  -- Clamp score between 0 and 100
  IF score > 100 THEN score := 100; END IF;
  IF score < 0 THEN score := 0; END IF;

  RETURN ROUND(score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get readability grade level
CREATE OR REPLACE FUNCTION get_readability_grade(p_flesch_score DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF p_flesch_score IS NULL THEN
    RETURN 'Unknown';
  ELSIF p_flesch_score >= 90 THEN
    RETURN '5th grade';
  ELSIF p_flesch_score >= 80 THEN
    RETURN '6th grade';
  ELSIF p_flesch_score >= 70 THEN
    RETURN '7th grade';
  ELSIF p_flesch_score >= 60 THEN
    RETURN '8th-9th grade';
  ELSIF p_flesch_score >= 50 THEN
    RETURN '10th-12th grade';
  ELSIF p_flesch_score >= 30 THEN
    RETURN 'College';
  ELSE
    RETURN 'College graduate';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate keyword density
CREATE OR REPLACE FUNCTION calculate_keyword_density(
  p_keyword_frequency INTEGER,
  p_total_words INTEGER
)
RETURNS DECIMAL(5,2) AS $$
BEGIN
  IF p_total_words = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((p_keyword_frequency::DECIMAL / p_total_words::DECIMAL) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get content optimization priority
CREATE OR REPLACE FUNCTION determine_optimization_priority(
  p_current_score INTEGER,
  p_traffic_potential TEXT,
  p_keyword_position INTEGER
)
RETURNS TEXT AS $$
BEGIN
  -- Critical: Low score and high traffic potential
  IF p_current_score < 40 AND p_traffic_potential = 'high' THEN
    RETURN 'critical';
  END IF;

  -- High: Low score or high-potential keywords not ranking well
  IF p_current_score < 50 OR (p_keyword_position > 10 AND p_traffic_potential = 'high') THEN
    RETURN 'high';
  END IF;

  -- Medium: Average score or medium potential
  IF p_current_score < 70 OR p_traffic_potential = 'medium' THEN
    RETURN 'medium';
  END IF;

  -- Low: Good score or low potential
  RETURN 'low';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to track content optimization progress
CREATE OR REPLACE FUNCTION update_optimization_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate improvement percentage
  IF NEW.score_before_optimization IS NOT NULL AND NEW.score_after_optimization IS NOT NULL THEN
    NEW.improvement_percentage := ROUND(
      ((NEW.score_after_optimization - NEW.score_before_optimization)::DECIMAL / NEW.score_before_optimization::DECIMAL) * 100,
      2
    );
  END IF;

  -- Calculate implementation progress
  IF NEW.recommendations_total IS NOT NULL AND NEW.recommendations_total > 0 THEN
    NEW.implementation_progress_percentage := ROUND(
      (NEW.recommendations_implemented::DECIMAL / NEW.recommendations_total::DECIMAL) * 100,
      2
    );

    -- Update status based on progress
    IF NEW.implementation_progress_percentage >= 90 THEN
      NEW.optimization_status := 'optimized';
    ELSIF NEW.implementation_progress_percentage > 0 THEN
      NEW.optimization_status := 'in_progress';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_optimization_progress
  BEFORE UPDATE ON seo_content_optimization
  FOR EACH ROW
  WHEN (
    OLD.score_after_optimization IS DISTINCT FROM NEW.score_after_optimization OR
    OLD.recommendations_implemented IS DISTINCT FROM NEW.recommendations_implemented
  )
  EXECUTE FUNCTION update_optimization_progress();

-- ============================================================================
-- Views for easier data access
-- ============================================================================

-- View: Content Optimization Dashboard
CREATE OR REPLACE VIEW v_content_optimization_dashboard AS
SELECT
  url,
  title,
  overall_content_score,
  word_count,
  readability_grade_level,
  optimization_status,
  optimization_priority,
  issues_count,
  recommendations_total,
  recommendations_implemented,
  implementation_progress_percentage,
  improvement_percentage,
  analyzed_at,
  last_optimized_at
FROM seo_content_optimization
WHERE optimization_status != 'optimized'
ORDER BY
  CASE optimization_priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  overall_content_score ASC;

-- View: High-Priority Content Issues
CREATE OR REPLACE VIEW v_high_priority_content_issues AS
SELECT
  url,
  title,
  overall_content_score,
  issues_count,
  optimization_priority,
  target_keyword,
  keyword_optimization_score,
  readability_score_rating,
  analyzed_at
FROM seo_content_optimization
WHERE optimization_priority IN ('critical', 'high')
  AND optimization_status != 'optimized'
ORDER BY
  CASE optimization_priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
  END,
  issues_count DESC;

-- View: Semantic Opportunities
CREATE OR REPLACE VIEW v_semantic_opportunities AS
SELECT
  url,
  primary_keyword,
  semantic_richness_score,
  content_comprehensiveness_score,
  featured_snippet_opportunity,
  paa_opportunity,
  array_length(missing_keywords, 1) as missing_keywords_count,
  array_length(priority_topics_to_cover, 1) as priority_topics_count,
  analyzed_at
FROM seo_semantic_analysis
WHERE featured_snippet_opportunity = true
   OR paa_opportunity = true
   OR semantic_richness_score < 70
ORDER BY
  CASE
    WHEN featured_snippet_opportunity THEN 1
    WHEN paa_opportunity THEN 2
    ELSE 3
  END,
  semantic_richness_score ASC;

-- Comments on views
COMMENT ON VIEW v_content_optimization_dashboard IS 'Dashboard view of content requiring optimization';
COMMENT ON VIEW v_high_priority_content_issues IS 'High-priority content that needs immediate attention';
COMMENT ON VIEW v_semantic_opportunities IS 'Content with opportunities for featured snippets and semantic optimization';

-- ============================================================================
-- Function to generate content optimization report
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_content_optimization_report()
RETURNS TABLE(
  total_pages INTEGER,
  avg_content_score DECIMAL,
  pages_optimized INTEGER,
  pages_need_optimization INTEGER,
  avg_word_count INTEGER,
  avg_readability_score DECIMAL,
  high_priority_pages INTEGER,
  total_issues INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_pages,
    ROUND(AVG(overall_content_score), 2) as avg_content_score,
    COUNT(*) FILTER (WHERE optimization_status = 'optimized')::INTEGER as pages_optimized,
    COUNT(*) FILTER (WHERE optimization_status IN ('needs_optimization', 'not_started'))::INTEGER as pages_need_optimization,
    ROUND(AVG(word_count))::INTEGER as avg_word_count,
    ROUND(AVG(readability_score), 2) as avg_readability_score,
    COUNT(*) FILTER (WHERE optimization_priority IN ('critical', 'high'))::INTEGER as high_priority_pages,
    SUM(issues_count)::INTEGER as total_issues
  FROM seo_content_optimization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Initial Data: None required
-- ============================================================================

-- ============================================================================
-- End of Migration
-- ============================================================================
