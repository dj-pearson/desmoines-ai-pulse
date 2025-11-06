-- Add fuzzy search with pg_trgm extension for typo tolerance
-- Allows searches like "restuarant" to find "restaurant"

-- Step 1: Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Add trigram indexes for fuzzy matching on events
CREATE INDEX IF NOT EXISTS events_title_trgm_idx ON events USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS events_venue_trgm_idx ON events USING GIN (venue gin_trgm_ops);
CREATE INDEX IF NOT EXISTS events_location_trgm_idx ON events USING GIN (location gin_trgm_ops);

-- Step 3: Add trigram indexes for fuzzy matching on restaurants
CREATE INDEX IF NOT EXISTS restaurants_name_trgm_idx ON restaurants USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS restaurants_cuisine_trgm_idx ON restaurants USING GIN (cuisine gin_trgm_ops);
CREATE INDEX IF NOT EXISTS restaurants_location_trgm_idx ON restaurants USING GIN (location gin_trgm_ops);

-- Step 4: Drop existing functions if they exist (to handle any conflicts)
DROP FUNCTION IF EXISTS fuzzy_search_events(text, real, integer);
DROP FUNCTION IF EXISTS fuzzy_search_restaurants(text, real, integer);
DROP FUNCTION IF EXISTS get_event_suggestions(text, integer);

-- Step 5: Create fuzzy search function for events
CREATE FUNCTION fuzzy_search_events(
  search_query text,
  similarity_threshold real DEFAULT 0.3,
  limit_count integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamp with time zone,
  venue text,
  location text,
  similarity_score real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.date,
    e.venue,
    e.location,
    GREATEST(
      similarity(e.title, search_query),
      similarity(COALESCE(e.venue, ''), search_query),
      similarity(COALESCE(e.location, ''), search_query)
    ) as similarity_score
  FROM events e
  WHERE
    e.date >= CURRENT_DATE
    AND (
      similarity(e.title, search_query) > similarity_threshold
      OR similarity(COALESCE(e.venue, ''), search_query) > similarity_threshold
      OR similarity(COALESCE(e.location, ''), search_query) > similarity_threshold
    )
  ORDER BY similarity_score DESC, e.date ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 6: Create fuzzy search function for restaurants
CREATE FUNCTION fuzzy_search_restaurants(
  search_query text,
  similarity_threshold real DEFAULT 0.3,
  limit_count integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  cuisine text,
  location text,
  city text,
  similarity_score real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.cuisine,
    r.location,
    r.city,
    GREATEST(
      similarity(r.name, search_query),
      similarity(COALESCE(r.cuisine, ''), search_query),
      similarity(COALESCE(r.location, ''), search_query)
    ) as similarity_score
  FROM restaurants r
  WHERE
    similarity(r.name, search_query) > similarity_threshold
    OR similarity(COALESCE(r.cuisine, ''), search_query) > similarity_threshold
    OR similarity(COALESCE(r.location, ''), search_query) > similarity_threshold
  ORDER BY similarity_score DESC, r.popularity_score DESC NULLS LAST
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 7: Create helper function to get search suggestions (autocomplete)
CREATE FUNCTION get_event_suggestions(
  search_query text,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  suggestion text,
  suggestion_type text,
  similarity_score real
) AS $$
BEGIN
  RETURN QUERY
  WITH title_suggestions AS (
    SELECT DISTINCT
      e.title as suggestion,
      'title'::text as suggestion_type,
      similarity(e.title, search_query) as similarity_score
    FROM events e
    WHERE
      e.date >= CURRENT_DATE
      AND similarity(e.title, search_query) > 0.2
  ),
  venue_suggestions AS (
    SELECT DISTINCT
      e.venue as suggestion,
      'venue'::text as suggestion_type,
      similarity(e.venue, search_query) as similarity_score
    FROM events e
    WHERE
      e.date >= CURRENT_DATE
      AND e.venue IS NOT NULL
      AND similarity(e.venue, search_query) > 0.2
  ),
  category_suggestions AS (
    SELECT DISTINCT
      e.category as suggestion,
      'category'::text as suggestion_type,
      similarity(e.category, search_query) as similarity_score
    FROM events e
    WHERE
      e.date >= CURRENT_DATE
      AND e.category IS NOT NULL
      AND similarity(e.category, search_query) > 0.2
  )
  SELECT * FROM (
    SELECT * FROM title_suggestions
    UNION ALL
    SELECT * FROM venue_suggestions
    UNION ALL
    SELECT * FROM category_suggestions
  ) suggestions
  ORDER BY similarity_score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 8: Grant necessary permissions
GRANT EXECUTE ON FUNCTION fuzzy_search_events(text, real, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fuzzy_search_restaurants(text, real, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_event_suggestions(text, integer) TO anon, authenticated;

-- Step 9: Add comments for documentation
COMMENT ON FUNCTION fuzzy_search_events(text, real, integer) IS 'Performs fuzzy matching search on events with configurable similarity threshold (default 0.3)';
COMMENT ON FUNCTION fuzzy_search_restaurants(text, real, integer) IS 'Performs fuzzy matching search on restaurants with configurable similarity threshold (default 0.3)';
COMMENT ON FUNCTION get_event_suggestions(text, integer) IS 'Returns search suggestions for autocomplete based on trigram similarity';

-- Log success
DO $$
BEGIN
  RAISE NOTICE '✅ Fuzzy search with pg_trgm enabled successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Features added:';
  RAISE NOTICE '- Typo-tolerant search (e.g., "restuarant" finds "restaurant")';
  RAISE NOTICE '- Trigram indexes for fast similarity matching';
  RAISE NOTICE '- fuzzy_search_events() function with similarity scoring';
  RAISE NOTICE '- fuzzy_search_restaurants() function with similarity scoring';
  RAISE NOTICE '- get_event_suggestions() for autocomplete';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage example:';
  RAISE NOTICE '  SELECT * FROM fuzzy_search_events(''iowa cuvs'', 0.3);';
  RAISE NOTICE '  -- Will find "Iowa Cubs" despite typo';
END $$;
