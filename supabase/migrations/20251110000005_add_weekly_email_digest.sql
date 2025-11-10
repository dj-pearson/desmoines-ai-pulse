-- Add weekly email digest system
-- Sends personalized weekly event roundups to users

-- Create user email preferences table
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_digest_enabled BOOLEAN DEFAULT true,
  digest_day_of_week INTEGER DEFAULT 0 CHECK (digest_day_of_week >= 0 AND digest_day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  digest_time_hour INTEGER DEFAULT 8 CHECK (digest_time_hour >= 0 AND digest_time_hour <= 23),
  categories_filter TEXT[], -- If set, only include events in these categories
  max_distance_miles INTEGER DEFAULT 30, -- For location-based filtering
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One preference per user
  UNIQUE(user_id)
);

-- Create index for performance
CREATE INDEX idx_user_email_preferences_user_id ON public.user_email_preferences(user_id);
CREATE INDEX idx_user_email_preferences_digest_enabled ON public.user_email_preferences(weekly_digest_enabled) WHERE weekly_digest_enabled = true;

-- Enable Row Level Security
ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own email preferences"
  ON public.user_email_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
  ON public.user_email_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
  ON public.user_email_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create digest log table to track sent emails
CREATE TABLE IF NOT EXISTS public.weekly_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  events_included INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,

  -- Indexes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_digest_log_user_id ON public.weekly_digest_log(user_id);
CREATE INDEX idx_weekly_digest_log_sent_at ON public.weekly_digest_log(sent_at DESC);

-- Enable Row Level Security
ALTER TABLE public.weekly_digest_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own digest log"
  ON public.weekly_digest_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Function to get users eligible for weekly digest
CREATE OR REPLACE FUNCTION get_weekly_digest_recipients()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  categories_filter TEXT[],
  max_distance_miles INTEGER,
  home_latitude REAL,
  home_longitude REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uep.user_id,
    p.email,
    p.first_name,
    p.last_name,
    uep.categories_filter,
    uep.max_distance_miles,
    p.home_latitude,
    p.home_longitude
  FROM user_email_preferences uep
  JOIN profiles p ON p.id = uep.user_id
  WHERE uep.weekly_digest_enabled = true
    AND p.email IS NOT NULL
    AND p.email_verified = true
    -- Don't send if already sent in last 6 days
    AND NOT EXISTS (
      SELECT 1
      FROM weekly_digest_log wdl
      WHERE wdl.user_id = uep.user_id
        AND wdl.sent_at > NOW() - INTERVAL '6 days'
    );
END;
$$;

-- Function to generate personalized digest content for a user
CREATE OR REPLACE FUNCTION get_user_weekly_digest_content(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_prefs RECORD;
  v_upcoming_rsvps JSONB;
  v_saved_events JSONB;
  v_recommendations JSONB;
  v_trending_events JSONB;
  v_result JSONB;
BEGIN
  -- Get user preferences
  SELECT
    categories_filter,
    max_distance_miles
  INTO v_user_prefs
  FROM user_email_preferences
  WHERE user_id = p_user_id;

  -- If no preferences found, use defaults
  IF v_user_prefs IS NULL THEN
    v_user_prefs.categories_filter := NULL;
    v_user_prefs.max_distance_miles := 30;
  END IF;

  -- Get user's upcoming RSVPs (next 7 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'location', e.location,
      'category', e.category,
      'image_url', e.image_url,
      'status', ea.status
    )
  )
  INTO v_upcoming_rsvps
  FROM event_attendance ea
  JOIN events e ON e.id = ea.event_id
  WHERE ea.user_id = p_user_id
    AND ea.status IN ('going', 'interested')
    AND e.date >= CURRENT_DATE
    AND e.date <= CURRENT_DATE + INTERVAL '7 days'
  ORDER BY e.date ASC
  LIMIT 5;

  -- Get user's saved events (next 7 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'location', e.location,
      'category', e.category,
      'image_url', e.image_url
    )
  )
  INTO v_saved_events
  FROM user_event_interactions uei
  JOIN events e ON e.id = uei.event_id
  WHERE uei.user_id = p_user_id
    AND uei.interaction_type = 'favorite'
    AND e.date >= CURRENT_DATE
    AND e.date <= CURRENT_DATE + INTERVAL '7 days'
  ORDER BY e.date ASC
  LIMIT 5;

  -- Get personalized recommendations (next 14 days, max 6)
  SELECT jsonb_agg(row_to_json(rec))
  INTO v_recommendations
  FROM (
    SELECT
      id, title, date, location, category, image_url,
      recommendation_reason
    FROM get_personalized_recommendations(NULL, NULL, 6)
    WHERE date <= CURRENT_DATE + INTERVAL '14 days'
  ) rec;

  -- Get trending events as fallback
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'location', e.location,
      'category', e.category,
      'image_url', e.image_url,
      'interaction_count', COUNT(DISTINCT uei.id)
    )
  )
  INTO v_trending_events
  FROM events e
  LEFT JOIN user_event_interactions uei ON e.id = uei.event_id
  WHERE e.date >= CURRENT_DATE
    AND e.date <= CURRENT_DATE + INTERVAL '14 days'
  GROUP BY e.id
  ORDER BY e.is_featured DESC, COUNT(DISTINCT uei.id) DESC, e.date ASC
  LIMIT 6;

  -- Build result
  v_result := jsonb_build_object(
    'upcoming_rsvps', COALESCE(v_upcoming_rsvps, '[]'::jsonb),
    'saved_events', COALESCE(v_saved_events, '[]'::jsonb),
    'recommendations', COALESCE(v_recommendations, '[]'::jsonb),
    'trending_events', COALESCE(v_trending_events, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_weekly_digest_recipients() TO service_role;
GRANT EXECUTE ON FUNCTION get_user_weekly_digest_content(UUID) TO service_role;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_email_preferences_updated_at
  BEFORE UPDATE ON user_email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_email_preferences_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.user_email_preferences IS
'Stores user preferences for weekly email digests and other email communications';

COMMENT ON TABLE public.weekly_digest_log IS
'Logs all sent weekly digest emails for tracking and debugging';

COMMENT ON FUNCTION get_weekly_digest_recipients IS
'Returns list of users eligible to receive weekly digest (enabled, verified, not sent recently)';

COMMENT ON FUNCTION get_user_weekly_digest_content IS
'Generates personalized digest content for a specific user including RSVPs, favorites, and recommendations';
