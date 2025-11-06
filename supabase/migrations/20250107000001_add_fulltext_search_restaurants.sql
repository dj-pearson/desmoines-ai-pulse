-- Add full-text search support to restaurants table
-- This migration adds tsvector columns and indexes for fast, ranked text search

-- Step 1: Add search_vector column to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS restaurants_search_idx ON restaurants USING GIN(search_vector);

-- Step 3: Create function to update search vector
-- Weighted search: name (A=highest), cuisine (B), description (C), location (D)
CREATE OR REPLACE FUNCTION restaurants_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.cuisine, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, NEW.ai_writeup, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location, NEW.city, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to auto-update search vector on insert/update
DROP TRIGGER IF EXISTS restaurants_search_vector_trigger ON restaurants;
CREATE TRIGGER restaurants_search_vector_trigger
  BEFORE INSERT OR UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION restaurants_search_vector_update();

-- Step 5: Backfill search vectors for existing restaurants
UPDATE restaurants SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(cuisine, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, ai_writeup, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(location, city, '')), 'D')
WHERE search_vector IS NULL;

-- Step 6: Create helper function for ranked search
CREATE OR REPLACE FUNCTION search_restaurants(
  search_query text,
  limit_count integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  cuisine text,
  location text,
  city text,
  rating numeric,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.cuisine,
    r.location,
    r.city,
    r.rating,
    ts_rank(r.search_vector, websearch_to_tsquery('english', search_query)) as rank
  FROM restaurants r
  WHERE r.search_vector @@ websearch_to_tsquery('english', search_query)
  ORDER BY rank DESC, r.popularity_score DESC NULLS LAST
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Add comment for documentation
COMMENT ON COLUMN restaurants.search_vector IS 'Full-text search vector with weighted fields (A=name, B=cuisine, C=description, D=location)';
COMMENT ON FUNCTION search_restaurants IS 'Performs weighted full-text search on restaurants with relevance ranking';

-- Step 8: Grant necessary permissions
GRANT EXECUTE ON FUNCTION search_restaurants TO anon, authenticated;
