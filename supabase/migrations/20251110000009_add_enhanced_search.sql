-- Add enhanced search with full-text search, fuzzy matching, and ranking
-- Dramatically improves event discovery and search relevance

-- Enable required extensions (pg_trgm already enabled in most Supabase instances)
DO $$ 
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION 
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION 
  WHEN duplicate_object THEN NULL;
END $$;

-- Add full-text search column to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create index for full-text search (GIN index for performance)
CREATE INDEX IF NOT EXISTS idx_events_search_vector ON public.events USING GIN(search_vector);

-- Create trigram indexes for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON public.events USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_category_trgm ON public.events USING GIN(category gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_location_trgm ON public.events USING GIN(location gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_venue_trgm ON public.events USING GIN(venue gin_trgm_ops);

-- Function to update search_vector
CREATE OR REPLACE FUNCTION update_event_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', unaccent(COALESCE(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(COALESCE(NEW.category, ''))), 'B') ||
    setweight(to_tsvector('english', unaccent(COALESCE(NEW.venue, ''))), 'B') ||
    setweight(to_tsvector('english', unaccent(COALESCE(NEW.location, ''))), 'C') ||
    setweight(to_tsvector('english', unaccent(COALESCE(NEW.enhanced_description, NEW.original_description, ''))), 'D');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search_vector
DROP TRIGGER IF EXISTS trigger_update_event_search_vector ON public.events;
CREATE TRIGGER trigger_update_event_search_vector
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION update_event_search_vector();

-- Backfill search_vector for existing events
UPDATE public.events SET updated_at = updated_at WHERE search_vector IS NULL;

-- Drop existing search analytics table if it exists (clean slate)
DROP TABLE IF EXISTS public.search_analytics CASCADE;

-- Create search analytics table
CREATE TABLE public.search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  search_query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  clicked_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  clicked_position INTEGER,
  search_filters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for analytics (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON public.search_analytics(search_query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON public.search_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user_id ON public.search_analytics(user_id);

-- Enable RLS
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policy for search analytics (anyone can insert, only admins can view)
DROP POLICY IF EXISTS "Anyone can log searches" ON public.search_analytics;
CREATE POLICY "Anyone can log searches"
  ON public.search_analytics
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view search analytics" ON public.search_analytics;
CREATE POLICY "Admins can view search analytics"
  ON public.search_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_role IN ('admin', 'root_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'root_admin')
    )
  );

-- Enhanced search function with ranking and fuzzy matching
CREATE OR REPLACE FUNCTION enhanced_event_search(
  p_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_date_start DATE DEFAULT NULL,
  p_date_end DATE DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_price_range TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  date DATE,
  location TEXT,
  category TEXT,
  image_url TEXT,
  price TEXT,
  venue TEXT,
  is_featured BOOLEAN,
  event_start_utc TIMESTAMPTZ,
  event_start_local TIMESTAMPTZ,
  city TEXT,
  latitude REAL,
  longitude REAL,
  enhanced_description TEXT,
  search_rank REAL,
  similarity_score REAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tsquery tsquery;
  v_query_normalized TEXT;
BEGIN
  -- Normalize query
  v_query_normalized := unaccent(lower(trim(p_query)));

  -- Convert to tsquery for full-text search
  v_tsquery := plainto_tsquery('english', v_query_normalized);

  RETURN QUERY
  WITH ranked_events AS (
    SELECT
      e.id,
      e.title,
      e.date,
      e.location,
      e.category,
      e.image_url,
      e.price,
      e.venue,
      e.is_featured,
      e.event_start_utc,
      e.event_start_local,
      e.city,
      e.latitude,
      e.longitude,
      e.enhanced_description,

      -- Full-text search ranking
      ts_rank_cd(e.search_vector, v_tsquery) AS fts_rank,

      -- Trigram similarity scores
      GREATEST(
        similarity(lower(e.title), v_query_normalized),
        similarity(lower(e.category), v_query_normalized),
        similarity(lower(COALESCE(e.venue, '')), v_query_normalized),
        similarity(lower(COALESCE(e.location, '')), v_query_normalized)
      ) AS trgm_similarity,

      -- Boost for featured events
      CASE WHEN e.is_featured THEN 0.5 ELSE 0 END AS featured_boost,

      -- Boost for upcoming events (next 7 days)
      CASE
        WHEN e.date >= CURRENT_DATE AND e.date <= CURRENT_DATE + INTERVAL '7 days' THEN 0.3
        WHEN e.date > CURRENT_DATE + INTERVAL '7 days' AND e.date <= CURRENT_DATE + INTERVAL '30 days' THEN 0.1
        ELSE 0
      END AS recency_boost

    FROM public.events e
    WHERE e.date >= CURRENT_DATE
      -- Apply filters
      AND (p_category IS NULL OR e.category ILIKE '%' || p_category || '%')
      AND (p_date_start IS NULL OR e.date >= p_date_start)
      AND (p_date_end IS NULL OR e.date <= p_date_end)
      AND (p_location IS NULL OR
           e.location ILIKE '%' || p_location || '%' OR
           e.city ILIKE '%' || p_location || '%')
      AND (p_price_range IS NULL OR
           (p_price_range = 'free' AND (e.price IS NULL OR e.price ILIKE '%free%')) OR
           (p_price_range = 'paid' AND e.price IS NOT NULL AND e.price NOT ILIKE '%free%'))
      -- Match query in full-text search OR trigram similarity
      AND (
        e.search_vector @@ v_tsquery OR
        lower(e.title) % v_query_normalized OR
        lower(e.category) % v_query_normalized OR
        lower(COALESCE(e.venue, '')) % v_query_normalized OR
        lower(COALESCE(e.location, '')) % v_query_normalized
      )
  )
  SELECT
    re.id,
    re.title,
    re.date,
    re.location,
    re.category,
    re.image_url,
    re.price,
    re.venue,
    re.is_featured,
    re.event_start_utc,
    re.event_start_local,
    re.city,
    re.latitude,
    re.longitude,
    re.enhanced_description,
    -- Combined ranking score
    (re.fts_rank + re.trgm_similarity + re.featured_boost + re.recency_boost)::REAL AS search_rank,
    re.trgm_similarity::REAL AS similarity_score
  FROM ranked_events re
  WHERE re.fts_rank > 0 OR re.trgm_similarity > 0.1
  ORDER BY search_rank DESC, re.date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get search suggestions (autocomplete)
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  suggestion TEXT,
  suggestion_type TEXT,
  event_count INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query_normalized TEXT;
BEGIN
  v_query_normalized := unaccent(lower(trim(p_query)));

  RETURN QUERY
  WITH title_suggestions AS (
    SELECT DISTINCT
      e.title AS suggestion,
      'event'::TEXT AS suggestion_type,
      1::INTEGER AS event_count,
      similarity(lower(e.title), v_query_normalized) AS sim_score
    FROM public.events e
    WHERE e.date >= CURRENT_DATE
      AND e.title IS NOT NULL
      AND lower(e.title) LIKE '%' || v_query_normalized || '%'
    ORDER BY similarity(lower(e.title), v_query_normalized) DESC
    LIMIT p_limit / 2
  ),
  category_suggestions AS (
    SELECT DISTINCT
      e.category AS suggestion,
      'category'::TEXT AS suggestion_type,
      COUNT(*)::INTEGER AS event_count,
      similarity(lower(e.category), v_query_normalized) AS sim_score
    FROM public.events e
    WHERE e.date >= CURRENT_DATE
      AND e.category IS NOT NULL
      AND lower(e.category) LIKE '%' || v_query_normalized || '%'
    GROUP BY e.category
    ORDER BY COUNT(*) DESC, similarity(lower(e.category), v_query_normalized) DESC
    LIMIT p_limit / 4
  ),
  venue_suggestions AS (
    SELECT DISTINCT
      e.venue AS suggestion,
      'venue'::TEXT AS suggestion_type,
      COUNT(*)::INTEGER AS event_count,
      similarity(lower(e.venue), v_query_normalized) AS sim_score
    FROM public.events e
    WHERE e.date >= CURRENT_DATE
      AND e.venue IS NOT NULL
      AND lower(e.venue) LIKE '%' || v_query_normalized || '%'
    GROUP BY e.venue
    ORDER BY COUNT(*) DESC, similarity(lower(e.venue), v_query_normalized) DESC
    LIMIT p_limit / 4
  )
  SELECT suggestion, suggestion_type, event_count
  FROM (
    SELECT * FROM title_suggestions
    UNION ALL
    SELECT * FROM category_suggestions
    UNION ALL
    SELECT * FROM venue_suggestions
  ) combined
  ORDER BY sim_score DESC;
END;
$$;

-- Function to get popular searches
CREATE OR REPLACE FUNCTION get_popular_searches(
  p_days INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  search_query TEXT,
  search_count BIGINT,
  avg_results INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.search_query,
    COUNT(*)::BIGINT AS search_count,
    AVG(sa.results_count)::INTEGER AS avg_results
  FROM public.search_analytics sa
  WHERE sa.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND sa.results_count > 0
  GROUP BY sa.search_query
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION enhanced_event_search TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_search_suggestions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_popular_searches TO authenticated, anon;

-- Add comments
COMMENT ON FUNCTION enhanced_event_search IS
'Advanced search with full-text search, fuzzy matching, and intelligent ranking';

COMMENT ON FUNCTION get_search_suggestions IS
'Returns autocomplete suggestions based on partial query';

COMMENT ON FUNCTION get_popular_searches IS
'Returns most popular search queries over specified time period';

COMMENT ON TABLE public.search_analytics IS
'Tracks search queries for analytics and improving search results';
