-- Create RPC function to get distinct event categories efficiently
-- This avoids fetching all events just to get unique categories

CREATE OR REPLACE FUNCTION get_event_categories()
RETURNS TABLE(category text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.category
  FROM events e
  WHERE e.date >= CURRENT_DATE
    AND e.category IS NOT NULL
  ORDER BY e.category;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_event_categories TO anon, authenticated;

COMMENT ON FUNCTION get_event_categories IS 'Returns distinct event categories for upcoming events. Used for filter dropdowns.';

-- Create RPC function to get distinct restaurant cuisines efficiently
CREATE OR REPLACE FUNCTION get_restaurant_cuisines()
RETURNS TABLE(cuisine text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT r.cuisine
  FROM restaurants r
  WHERE r.cuisine IS NOT NULL
  ORDER BY r.cuisine;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create RPC function to get distinct restaurant locations efficiently
CREATE OR REPLACE FUNCTION get_restaurant_locations()
RETURNS TABLE(location text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT r.location
  FROM restaurants r
  WHERE r.location IS NOT NULL
  ORDER BY r.location;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_restaurant_cuisines TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_restaurant_locations TO anon, authenticated;

COMMENT ON FUNCTION get_restaurant_cuisines IS 'Returns distinct restaurant cuisines. Used for filter dropdowns.';
COMMENT ON FUNCTION get_restaurant_locations IS 'Returns distinct restaurant locations. Used for filter dropdowns.';
