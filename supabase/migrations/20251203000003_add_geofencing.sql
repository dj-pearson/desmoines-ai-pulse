-- Add geofencing infrastructure
-- Tables for managing geofence regions and tracking geofence events

-- ============================================================================
-- PART 1: Create geofence_regions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS geofence_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL CHECK (radius_meters > 0),
  geom geography(POINT, 4326),
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index on geom for spatial queries
CREATE INDEX IF NOT EXISTS geofence_regions_geom_idx ON geofence_regions USING GIST(geom);
CREATE INDEX IF NOT EXISTS geofence_regions_active_idx ON geofence_regions(active) WHERE active = true;

-- Trigger to auto-update geom from lat/lng
CREATE OR REPLACE FUNCTION update_geofence_region_geom()
RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS geofence_regions_geom_trigger ON geofence_regions;
CREATE TRIGGER geofence_regions_geom_trigger
  BEFORE INSERT OR UPDATE ON geofence_regions
  FOR EACH ROW
  EXECUTE FUNCTION update_geofence_region_geom();

-- ============================================================================
-- PART 2: Create geofence_events table for logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  region_id UUID REFERENCES geofence_regions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('enter', 'exit', 'dwell')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS geofence_events_user_idx ON geofence_events(user_id);
CREATE INDEX IF NOT EXISTS geofence_events_region_idx ON geofence_events(region_id);
CREATE INDEX IF NOT EXISTS geofence_events_timestamp_idx ON geofence_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS geofence_events_type_idx ON geofence_events(event_type);

-- ============================================================================
-- PART 3: Create function to check if point is in any geofence
-- ============================================================================

CREATE OR REPLACE FUNCTION check_geofences(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION
)
RETURNS TABLE (
  region_id UUID,
  region_name TEXT,
  distance_meters DOUBLE PRECISION,
  is_inside BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    ST_Distance(
      g.geom,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)
    ) as distance_meters,
    ST_DWithin(
      g.geom,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326),
      g.radius_meters
    ) as is_inside
  FROM geofence_regions g
  WHERE g.active = true
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_geofences TO authenticated, anon;

-- ============================================================================
-- PART 4: Create function to get nearby geofences
-- ============================================================================

CREATE OR REPLACE FUNCTION nearby_geofences(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  max_distance_meters INTEGER DEFAULT 5000
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.description,
    g.latitude,
    g.longitude,
    g.radius_meters,
    ST_Distance(
      g.geom,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)
    ) as distance_meters
  FROM geofence_regions g
  WHERE
    g.active = true
    AND ST_DWithin(
      g.geom,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326),
      max_distance_meters
    )
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION nearby_geofences TO authenticated, anon;

-- ============================================================================
-- PART 5: Row Level Security
-- ============================================================================

ALTER TABLE geofence_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;

-- Public can read active geofence regions
CREATE POLICY "Anyone can view active geofence regions"
  ON geofence_regions FOR SELECT
  USING (active = true);

-- Authenticated users can create/update geofence regions
CREATE POLICY "Authenticated users can create geofence regions"
  ON geofence_regions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own geofence regions"
  ON geofence_regions FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- Admins can do everything
CREATE POLICY "Admins can manage all geofence regions"
  ON geofence_regions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Users can only see their own geofence events
CREATE POLICY "Users can view their own geofence events"
  ON geofence_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can log their own geofence events
CREATE POLICY "Users can log their own geofence events"
  ON geofence_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can view all events
CREATE POLICY "Admins can view all geofence events"
  ON geofence_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- PART 6: Create some default geofence regions for Des Moines
-- ============================================================================

INSERT INTO geofence_regions (name, description, latitude, longitude, radius_meters, active)
VALUES
  ('Downtown Des Moines', 'Central business district', 41.5868, -93.6250, 2000, true),
  ('State Capitol Area', 'Iowa State Capitol and surrounding area', 41.5912, -93.6037, 1000, true),
  ('East Village', 'Trendy neighborhood with restaurants and shops', 41.5879, -93.6165, 800, true),
  ('Gray''s Lake Park', 'Popular recreation area', 41.5732, -93.6447, 1500, true),
  ('Principal Park', 'Iowa Cubs baseball stadium', 41.5827, -93.6181, 500, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 7: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE geofence_regions IS 'Defines geographic boundaries for location-based features and notifications';
COMMENT ON TABLE geofence_events IS 'Logs when users enter, exit, or dwell in geofence regions';
COMMENT ON FUNCTION check_geofences IS 'Check if a point is inside any active geofence regions';
COMMENT ON FUNCTION nearby_geofences IS 'Find geofence regions near a given location';

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
DECLARE
  regions_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO regions_count FROM geofence_regions WHERE active = true;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Geofencing infrastructure created successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '- % active geofence regions defined', regions_count;
  RAISE NOTICE '- Geofence event logging enabled';
  RAISE NOTICE '- Spatial queries for geofence detection';
  RAISE NOTICE '- Row-level security configured';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions available:';
  RAISE NOTICE '- check_geofences(lat, lng) - Check if point is in any region';
  RAISE NOTICE '- nearby_geofences(lat, lng, max_distance) - Find nearby regions';
  RAISE NOTICE '';
END $$;
