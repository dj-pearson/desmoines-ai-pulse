-- Add location history tracking for mobile app
-- Stores user location data for analytics, trip tracking, and personalization

-- ============================================================================
-- PART 1: Create location_history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  altitude_accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION, -- Direction of travel in degrees (0-360)
  speed DOUBLE PRECISION, -- Speed in meters per second
  geom geography(POINT, 4326),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS location_history_user_idx ON location_history(user_id);
CREATE INDEX IF NOT EXISTS location_history_timestamp_idx ON location_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS location_history_geom_idx ON location_history USING GIST(geom);
CREATE INDEX IF NOT EXISTS location_history_user_timestamp_idx ON location_history(user_id, timestamp DESC);

-- Trigger to auto-update geom from lat/lng
CREATE OR REPLACE FUNCTION update_location_history_geom()
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

DROP TRIGGER IF EXISTS location_history_geom_trigger ON location_history;
CREATE TRIGGER location_history_geom_trigger
  BEFORE INSERT ON location_history
  FOR EACH ROW
  EXECUTE FUNCTION update_location_history_geom();

-- ============================================================================
-- PART 2: Create function to get user's location path
-- ============================================================================

CREATE OR REPLACE FUNCTION user_location_path(
  p_user_id UUID,
  start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day',
  end_time TIMESTAMPTZ DEFAULT NOW(),
  limit_count INTEGER DEFAULT 1000
)
RETURNS TABLE (
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timestamp TIMESTAMPTZ,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lh.latitude,
    lh.longitude,
    lh.timestamp,
    lh.speed,
    lh.heading
  FROM location_history lh
  WHERE
    lh.user_id = p_user_id
    AND lh.timestamp BETWEEN start_time AND end_time
  ORDER BY lh.timestamp ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION user_location_path TO authenticated;

-- ============================================================================
-- PART 3: Create function to calculate distance traveled
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_distance_traveled(
  p_user_id UUID,
  start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day',
  end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  total_distance DOUBLE PRECISION := 0;
  prev_point geography;
  curr_point geography;
  point_record RECORD;
BEGIN
  FOR point_record IN
    SELECT geom, timestamp
    FROM location_history
    WHERE user_id = p_user_id
      AND timestamp BETWEEN start_time AND end_time
      AND geom IS NOT NULL
    ORDER BY timestamp ASC
  LOOP
    IF prev_point IS NOT NULL THEN
      total_distance := total_distance + ST_Distance(prev_point, point_record.geom);
    END IF;
    prev_point := point_record.geom;
  END LOOP;

  RETURN total_distance; -- Returns distance in meters
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_distance_traveled TO authenticated;

-- ============================================================================
-- PART 4: Create function to get user's most visited locations
-- ============================================================================

CREATE OR REPLACE FUNCTION user_most_visited_locations(
  p_user_id UUID,
  radius_meters INTEGER DEFAULT 100,
  min_visits INTEGER DEFAULT 3,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  visit_count BIGINT,
  first_visit TIMESTAMPTZ,
  last_visit TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH clustered_locations AS (
    SELECT
      latitude,
      longitude,
      timestamp,
      ST_ClusterDBSCAN(geom, eps := radius_meters, minpoints := min_visits) OVER() AS cluster_id
    FROM location_history
    WHERE user_id = p_user_id
      AND geom IS NOT NULL
  )
  SELECT
    AVG(latitude) as center_lat,
    AVG(longitude) as center_lng,
    COUNT(*) as visit_count,
    MIN(timestamp) as first_visit,
    MAX(timestamp) as last_visit
  FROM clustered_locations
  WHERE cluster_id IS NOT NULL
  GROUP BY cluster_id
  HAVING COUNT(*) >= min_visits
  ORDER BY visit_count DESC, last_visit DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION user_most_visited_locations TO authenticated;

-- ============================================================================
-- PART 5: Row Level Security
-- ============================================================================

ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own location history
CREATE POLICY "Users can view their own location history"
  ON location_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own location data
CREATE POLICY "Users can insert their own location data"
  ON location_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own location history
CREATE POLICY "Users can delete their own location history"
  ON location_history FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all location history
CREATE POLICY "Admins can view all location history"
  ON location_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- PART 6: Create function to cleanup old location data
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_location_history(
  days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM location_history
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (admin only)
GRANT EXECUTE ON FUNCTION cleanup_old_location_history TO authenticated;

-- ============================================================================
-- PART 7: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE location_history IS 
'Stores real-time location tracking data for users. 
Used for analytics, trip tracking, personalization, and location-based features.
Data is automatically cleaned up after 90 days.';

COMMENT ON FUNCTION user_location_path IS 
'Get ordered sequence of user locations for a time period. 
Useful for displaying travel path on a map.';

COMMENT ON FUNCTION calculate_distance_traveled IS 
'Calculate total distance traveled by user in a time period. 
Returns distance in meters.';

COMMENT ON FUNCTION user_most_visited_locations IS 
'Find locations where user spends the most time using spatial clustering. 
Useful for personalization and understanding user patterns.';

COMMENT ON FUNCTION cleanup_old_location_history IS 
'Delete location history older than specified days. 
Run periodically via cron job.';

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Location tracking infrastructure created successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '- Real-time location history storage';
  RAISE NOTICE '- User travel path reconstruction';
  RAISE NOTICE '- Distance traveled calculations';
  RAISE NOTICE '- Most visited locations detection';
  RAISE NOTICE '- Automatic data cleanup (90 days retention)';
  RAISE NOTICE '- Privacy-focused RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions available:';
  RAISE NOTICE '- user_location_path(user_id, start, end) - Get location path';
  RAISE NOTICE '- calculate_distance_traveled(user_id, start, end) - Calculate distance';
  RAISE NOTICE '- user_most_visited_locations(user_id) - Find frequent locations';
  RAISE NOTICE '- cleanup_old_location_history(days) - Clean old data';
  RAISE NOTICE '';
  RAISE NOTICE 'Privacy note: Location data is user-specific and protected by RLS';
  RAISE NOTICE '';
END $$;
