-- Add geospatial proximity search function for "Events Near Me" feature
-- This migration creates an optimized RPC function to search events by location radius

-- Function: search_events_near_location
-- Searches for events within a specified radius of a given lat/long coordinate
-- Returns events sorted by distance, includes distance in meters
CREATE OR REPLACE FUNCTION search_events_near_location(
  user_lat REAL,
  user_lon REAL,
  radius_meters INTEGER DEFAULT 50000, -- Default 50km (~30 miles)
  search_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  date TIMESTAMPTZ,
  location TEXT,
  venue TEXT,
  city TEXT,
  category TEXT,
  price TEXT,
  image_url TEXT,
  latitude REAL,
  longitude REAL,
  enhanced_description TEXT,
  is_featured BOOLEAN,
  event_start_utc TIMESTAMPTZ,
  event_start_local TIMESTAMP,
  distance_meters INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.date,
    e.location,
    e.venue,
    e.city,
    e.category,
    e.price,
    e.image_url,
    e.latitude,
    e.longitude,
    e.enhanced_description,
    e.is_featured,
    e.event_start_utc,
    e.event_start_local,
    CAST(
      ST_Distance(
        e.geom::geography,
        ST_MakePoint(user_lon, user_lat)::geography
      ) AS INTEGER
    ) as distance_meters
  FROM events e
  WHERE
    -- Only upcoming events
    e.date >= CURRENT_DATE
    -- Must have coordinates
    AND e.geom IS NOT NULL
    -- Within radius
    AND ST_DWithin(
      e.geom::geography,
      ST_MakePoint(user_lon, user_lat)::geography,
      radius_meters
    )
  ORDER BY
    -- Featured events first, then by distance
    e.is_featured DESC,
    distance_meters ASC,
    e.date ASC
  LIMIT search_limit;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION search_events_near_location(REAL, REAL, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_events_near_location(REAL, REAL, INTEGER, INTEGER) TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION search_events_near_location IS
'Searches for upcoming events within a radius of a given coordinate.
Returns events sorted by featured status and distance.
Requires PostGIS extension and events.geom column to be populated.
Default radius: 50km (50000 meters)';

-- Create helper function to convert meters to miles for display
CREATE OR REPLACE FUNCTION meters_to_miles(meters INTEGER)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT ROUND((meters * 0.000621371)::NUMERIC, 1);
$$;

GRANT EXECUTE ON FUNCTION meters_to_miles(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION meters_to_miles(INTEGER) TO anon;

COMMENT ON FUNCTION meters_to_miles IS 'Converts distance in meters to miles, rounded to 1 decimal place';
