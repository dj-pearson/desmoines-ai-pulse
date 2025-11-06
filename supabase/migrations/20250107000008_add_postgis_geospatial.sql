-- Add PostGIS geospatial capabilities for radius-based search
-- Enables "within X miles of me" functionality

-- Step 1: Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 2: Add geography columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS geom geography(POINT, 4326);

-- Step 3: Add geography columns to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS geom geography(POINT, 4326);

-- Step 4: Populate geography columns from existing lat/lng data
UPDATE events
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND geom IS NULL;

UPDATE restaurants
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND geom IS NULL;

-- Step 5: Create spatial indexes for fast distance queries
CREATE INDEX IF NOT EXISTS events_geom_idx ON events USING GIST(geom);
CREATE INDEX IF NOT EXISTS restaurants_geom_idx ON restaurants USING GIST(geom);

-- Step 6: Create trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_events_geom()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_restaurants_geom()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_geom_trigger ON events;
CREATE TRIGGER events_geom_trigger
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_events_geom();

DROP TRIGGER IF EXISTS restaurants_geom_trigger ON restaurants;
CREATE TRIGGER restaurants_geom_trigger
  BEFORE INSERT OR UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_restaurants_geom();

-- Step 7: Create function for events within radius
CREATE OR REPLACE FUNCTION events_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_miles double precision,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  title text,
  date timestamp with time zone,
  venue text,
  location text,
  latitude double precision,
  longitude double precision,
  distance_miles double precision
) AS $$
DECLARE
  center_point geography;
  radius_meters double precision;
BEGIN
  -- Create center point from lat/lng
  center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326);

  -- Convert miles to meters (1 mile = 1609.34 meters)
  radius_meters := radius_miles * 1609.34;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.date,
    e.venue,
    e.location,
    e.latitude,
    e.longitude,
    ST_Distance(e.geom, center_point) / 1609.34 as distance_miles
  FROM events e
  WHERE
    e.geom IS NOT NULL
    AND e.date >= CURRENT_DATE
    AND ST_DWithin(e.geom, center_point, radius_meters)
  ORDER BY distance_miles ASC, e.date ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create function for restaurants within radius
CREATE OR REPLACE FUNCTION restaurants_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_miles double precision,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  name text,
  cuisine text,
  location text,
  city text,
  rating numeric,
  latitude double precision,
  longitude double precision,
  distance_miles double precision
) AS $$
DECLARE
  center_point geography;
  radius_meters double precision;
BEGIN
  center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326);
  radius_meters := radius_miles * 1609.34;

  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.cuisine,
    r.location,
    r.city,
    r.rating,
    r.latitude,
    r.longitude,
    ST_Distance(r.geom, center_point) / 1609.34 as distance_miles
  FROM restaurants r
  WHERE
    r.geom IS NOT NULL
    AND ST_DWithin(r.geom, center_point, radius_meters)
  ORDER BY distance_miles ASC, r.popularity_score DESC NULLS LAST
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Grant necessary permissions
GRANT EXECUTE ON FUNCTION events_within_radius TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurants_within_radius TO anon, authenticated;

-- Step 10: Add comments for documentation
COMMENT ON EXTENSION postgis IS 'PostGIS spatial database extension - enables geospatial queries and distance calculations';
COMMENT ON COLUMN events.geom IS 'PostGIS geography point for spatial queries (auto-populated from latitude/longitude)';
COMMENT ON COLUMN restaurants.geom IS 'PostGIS geography point for spatial queries (auto-populated from latitude/longitude)';
COMMENT ON FUNCTION events_within_radius IS 'Find events within specified radius (in miles) of a center point. Returns results sorted by distance.';
COMMENT ON FUNCTION restaurants_within_radius IS 'Find restaurants within specified radius (in miles) of a center point. Returns results sorted by distance and popularity.';

-- Log success
DO $$
BEGIN
  RAISE NOTICE '✅ PostGIS geospatial search enabled successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Features added:';
  RAISE NOTICE '- Geospatial radius search ("within X miles of me")';
  RAISE NOTICE '- Distance calculations using Haversine formula (Earth surface)';
  RAISE NOTICE '- GIST spatial indexes for fast distance queries';
  RAISE NOTICE '- Auto-update triggers to sync geom with lat/lng changes';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage example:';
  RAISE NOTICE '  -- Find events within 10 miles of Des Moines (41.5868, -93.625)';
  RAISE NOTICE '  SELECT * FROM events_within_radius(41.5868, -93.625, 10);';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Find restaurants within 5 miles of a location';
  RAISE NOTICE '  SELECT * FROM restaurants_within_radius(41.5868, -93.625, 5);';
END $$;
