-- Add personalized event recommendations system
-- Analyzes user behavior (favorites, RSVPs, reminders) to suggest relevant events

-- Function to get personalized event recommendations for a user
CREATE OR REPLACE FUNCTION get_personalized_recommendations(
  p_user_lat REAL DEFAULT NULL,
  p_user_lon REAL DEFAULT NULL,
  p_limit INTEGER DEFAULT 12
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
  recommendation_score FLOAT,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_categories TEXT[];
  v_user_locations TEXT[];
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();

  -- Return empty if not authenticated
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get user's preferred categories based on interactions
  SELECT ARRAY_AGG(DISTINCT e.category)
  INTO v_user_categories
  FROM user_event_interactions uei
  JOIN events e ON e.id = uei.event_id
  WHERE uei.user_id = v_user_id
    AND uei.interaction_type IN ('favorite', 'view')
  LIMIT 10;

  -- Get user's preferred locations based on interactions
  SELECT ARRAY_AGG(DISTINCT e.city)
  INTO v_user_locations
  FROM user_event_interactions uei
  JOIN events e ON e.id = uei.event_id
  WHERE uei.user_id = v_user_id
    AND uei.interaction_type IN ('favorite', 'view')
    AND e.city IS NOT NULL
  LIMIT 5;

  -- Also consider event_attendance for location preferences
  IF v_user_locations IS NULL OR array_length(v_user_locations, 1) = 0 THEN
    SELECT ARRAY_AGG(DISTINCT e.city)
    INTO v_user_locations
    FROM event_attendance ea
    JOIN events e ON e.id = ea.event_id
    WHERE ea.user_id = v_user_id
      AND e.city IS NOT NULL
    LIMIT 5;
  END IF;

  -- Build recommendation query
  RETURN QUERY
  WITH user_interacted_events AS (
    -- Events user has already interacted with (exclude from recommendations)
    SELECT DISTINCT event_id
    FROM user_event_interactions
    WHERE user_id = v_user_id
    UNION
    SELECT DISTINCT event_id
    FROM event_attendance
    WHERE user_id = v_user_id
    UNION
    SELECT DISTINCT event_id
    FROM user_event_reminders
    WHERE user_id = v_user_id
  ),
  scored_events AS (
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
      -- Scoring algorithm
      (
        -- Category match score (highest weight)
        CASE
          WHEN v_user_categories IS NOT NULL AND e.category = ANY(v_user_categories) THEN 50
          ELSE 0
        END +

        -- Location match score
        CASE
          WHEN v_user_locations IS NOT NULL AND e.city = ANY(v_user_locations) THEN 30
          ELSE 0
        END +

        -- Featured event bonus
        CASE WHEN e.is_featured THEN 20 ELSE 0 END +

        -- Recency score (prefer events happening soon, but not too soon)
        CASE
          WHEN e.date >= CURRENT_DATE + INTERVAL '1 day'
           AND e.date <= CURRENT_DATE + INTERVAL '14 days' THEN 25
          WHEN e.date > CURRENT_DATE + INTERVAL '14 days'
           AND e.date <= CURRENT_DATE + INTERVAL '30 days' THEN 15
          WHEN e.date > CURRENT_DATE + INTERVAL '30 days' THEN 5
          ELSE 0
        END +

        -- Proximity score (if location provided)
        CASE
          WHEN p_user_lat IS NOT NULL
           AND p_user_lon IS NOT NULL
           AND e.latitude IS NOT NULL
           AND e.longitude IS NOT NULL THEN
            -- Calculate distance and give higher scores to closer events
            GREATEST(0, 25 - (
              6371000 * acos(
                cos(radians(p_user_lat)) * cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(p_user_lon)) +
                sin(radians(p_user_lat)) * sin(radians(e.latitude))
              ) / 1609.34 -- Convert meters to miles
            ))
          ELSE 0
        END +

        -- Random factor for diversity (0-10)
        (random() * 10)::INTEGER
      )::FLOAT AS score,

      -- Reason for recommendation
      CASE
        WHEN v_user_categories IS NOT NULL AND e.category = ANY(v_user_categories) THEN
          'Based on your interest in ' || e.category
        WHEN v_user_locations IS NOT NULL AND e.city = ANY(v_user_locations) THEN
          'Popular in ' || e.city
        WHEN e.is_featured THEN
          'Featured event'
        ELSE
          'Recommended for you'
      END AS reason
    FROM events e
    WHERE e.id NOT IN (SELECT event_id FROM user_interacted_events)
      AND e.date >= CURRENT_DATE
      AND e.date <= CURRENT_DATE + INTERVAL '90 days'
  )
  SELECT
    se.id,
    se.title,
    se.date,
    se.location,
    se.category,
    se.image_url,
    se.price,
    se.venue,
    se.is_featured,
    se.event_start_utc,
    se.event_start_local,
    se.city,
    se.latitude,
    se.longitude,
    se.enhanced_description,
    se.score AS recommendation_score,
    se.reason AS recommendation_reason
  FROM scored_events se
  WHERE se.score > 0
  ORDER BY se.score DESC, se.date ASC
  LIMIT p_limit;
END;
$$;

-- Function to get recommendations for new users (cold start problem)
CREATE OR REPLACE FUNCTION get_trending_events(
  p_limit INTEGER DEFAULT 12
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
  interaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
    COUNT(DISTINCT uei.id) AS interaction_count
  FROM events e
  LEFT JOIN user_event_interactions uei ON e.id = uei.event_id
  WHERE e.date >= CURRENT_DATE
    AND e.date <= CURRENT_DATE + INTERVAL '30 days'
  GROUP BY e.id
  ORDER BY
    e.is_featured DESC,
    COUNT(DISTINCT uei.id) DESC,
    e.date ASC
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_personalized_recommendations(REAL, REAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trending_events(INTEGER) TO authenticated, anon;

-- Add comments for documentation
COMMENT ON FUNCTION get_personalized_recommendations IS
'Generate personalized event recommendations based on user interaction history.
Analyzes favorites, RSVPs, and views to suggest relevant events.
Optionally accepts user location for proximity-based scoring.';

COMMENT ON FUNCTION get_trending_events IS
'Get trending events based on interaction count and featured status.
Used for new users who don''t have interaction history yet (cold start).';
