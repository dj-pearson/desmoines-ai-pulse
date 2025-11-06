-- Add full-text search support to events table
-- This migration adds tsvector columns and indexes for fast, ranked text search

-- Step 1: Add search_vector column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS events_search_idx ON events USING GIN(search_vector);

-- Step 3: Create function to update search vector
-- Weighted search: title (A=highest), description (B), venue (C), location (D=lowest)
CREATE OR REPLACE FUNCTION events_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.enhanced_description, NEW.original_description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.venue, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to auto-update search vector on insert/update
DROP TRIGGER IF EXISTS events_search_vector_trigger ON events;
CREATE TRIGGER events_search_vector_trigger
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION events_search_vector_update();

-- Step 5: Backfill search vectors for existing events
UPDATE events SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(enhanced_description, original_description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(venue, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(location, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'D')
WHERE search_vector IS NULL;

-- Step 6: Create helper function for ranked search
CREATE OR REPLACE FUNCTION search_events(
  search_query text,
  start_date date DEFAULT CURRENT_DATE,
  limit_count integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamp with time zone,
  location text,
  venue text,
  category text,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.date,
    e.location,
    e.venue,
    e.category,
    ts_rank(e.search_vector, websearch_to_tsquery('english', search_query)) as rank
  FROM events e
  WHERE
    e.search_vector @@ websearch_to_tsquery('english', search_query)
    AND e.date >= start_date
  ORDER BY rank DESC, e.date ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Add comment for documentation
COMMENT ON COLUMN events.search_vector IS 'Full-text search vector with weighted fields (A=title, B=description, C=venue, D=location/category)';
COMMENT ON FUNCTION search_events IS 'Performs weighted full-text search on events with relevance ranking';

-- Step 8: Grant necessary permissions
GRANT EXECUTE ON FUNCTION search_events TO anon, authenticated;
