-- Add social features: discussions, photos, check-ins, and activity feed
-- Creates community engagement and user-generated content

-- Event discussions/comments table
CREATE TABLE IF NOT EXISTS public.event_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES event_discussions(id) ON DELETE CASCADE, -- For threaded replies
  message TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false
);

-- Create indexes for discussions
CREATE INDEX idx_event_discussions_event_id ON public.event_discussions(event_id);
CREATE INDEX idx_event_discussions_user_id ON public.event_discussions(user_id);
CREATE INDEX idx_event_discussions_parent_id ON public.event_discussions(parent_id);
CREATE INDEX idx_event_discussions_created_at ON public.event_discussions(created_at DESC);

-- Discussion likes table (to track who liked what)
CREATE TABLE IF NOT EXISTS public.discussion_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID NOT NULL REFERENCES event_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(discussion_id, user_id)
);

CREATE INDEX idx_discussion_likes_discussion_id ON public.discussion_likes(discussion_id);
CREATE INDEX idx_discussion_likes_user_id ON public.discussion_likes(user_id);

-- Event photos table (user-submitted photos from events)
CREATE TABLE IF NOT EXISTS public.event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for photos
CREATE INDEX idx_event_photos_event_id ON public.event_photos(event_id);
CREATE INDEX idx_event_photos_user_id ON public.event_photos(user_id);
CREATE INDEX idx_event_photos_created_at ON public.event_photos(created_at DESC);
CREATE INDEX idx_event_photos_is_featured ON public.event_photos(is_featured) WHERE is_featured = true;

-- Photo likes table
CREATE TABLE IF NOT EXISTS public.photo_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(photo_id, user_id)
);

CREATE INDEX idx_photo_likes_photo_id ON public.photo_likes(photo_id);
CREATE INDEX idx_photo_likes_user_id ON public.photo_likes(user_id);

-- Event check-ins table (location-verified attendance)
CREATE TABLE IF NOT EXISTS public.event_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_latitude REAL,
  checkin_longitude REAL,
  distance_from_venue_meters INTEGER, -- Distance from event location
  is_verified BOOLEAN DEFAULT false, -- True if within 500m of venue
  checkin_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- One check-in per user per event
);

-- Create indexes for check-ins
CREATE INDEX idx_event_checkins_event_id ON public.event_checkins(event_id);
CREATE INDEX idx_event_checkins_user_id ON public.event_checkins(user_id);
CREATE INDEX idx_event_checkins_created_at ON public.event_checkins(created_at DESC);
CREATE INDEX idx_event_checkins_is_verified ON public.event_checkins(is_verified) WHERE is_verified = true;

-- Activity feed table (aggregated social activities)
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'event_favorite',
    'event_rsvp',
    'event_checkin',
    'event_comment',
    'event_photo',
    'event_reminder',
    'follow_user'
  )),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- For follows
  metadata JSONB, -- Additional activity data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for activity feed
CREATE INDEX idx_activity_feed_user_id ON public.activity_feed(user_id);
CREATE INDEX idx_activity_feed_created_at ON public.activity_feed(created_at DESC);
CREATE INDEX idx_activity_feed_activity_type ON public.activity_feed(activity_type);
CREATE INDEX idx_activity_feed_event_id ON public.activity_feed(event_id);

-- User follows table (social connections)
CREATE TABLE IF NOT EXISTS public.user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id) -- Can't follow yourself
);

-- Create indexes for follows
CREATE INDEX idx_user_follows_follower_id ON public.user_follows(follower_id);
CREATE INDEX idx_user_follows_following_id ON public.user_follows(following_id);

-- Enable Row Level Security on all tables
ALTER TABLE public.event_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_discussions
CREATE POLICY "Anyone can view discussions"
  ON public.event_discussions
  FOR SELECT
  USING (NOT is_deleted);

CREATE POLICY "Authenticated users can create discussions"
  ON public.event_discussions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discussions"
  ON public.event_discussions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discussions"
  ON public.event_discussions
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for discussion_likes
CREATE POLICY "Anyone can view discussion likes"
  ON public.discussion_likes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like discussions"
  ON public.discussion_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike discussions"
  ON public.discussion_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for event_photos
CREATE POLICY "Anyone can view event photos"
  ON public.event_photos
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can upload photos"
  ON public.event_photos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own photos"
  ON public.event_photos
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photos"
  ON public.event_photos
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for photo_likes
CREATE POLICY "Anyone can view photo likes"
  ON public.photo_likes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like photos"
  ON public.photo_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike photos"
  ON public.photo_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for event_checkins
CREATE POLICY "Anyone can view check-ins"
  ON public.event_checkins
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can check in"
  ON public.event_checkins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for activity_feed
CREATE POLICY "Users can view their own activity and followed users' activity"
  ON public.activity_feed
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM user_follows
      WHERE follower_id = auth.uid()
        AND following_id = activity_feed.user_id
    )
  );

CREATE POLICY "System can insert activity"
  ON public.activity_feed
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for user_follows
CREATE POLICY "Anyone can view follows"
  ON public.user_follows
  FOR SELECT
  USING (true);

CREATE POLICY "Users can follow others"
  ON public.user_follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON public.user_follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- Function to toggle discussion like
CREATE OR REPLACE FUNCTION toggle_discussion_like(
  p_discussion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_liked BOOLEAN;
  v_like_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if already liked
  SELECT id INTO v_like_id
  FROM discussion_likes
  WHERE user_id = v_user_id
    AND discussion_id = p_discussion_id;

  IF v_like_id IS NOT NULL THEN
    -- Unlike
    DELETE FROM discussion_likes WHERE id = v_like_id;
    UPDATE event_discussions
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = p_discussion_id;
    v_is_liked := FALSE;
  ELSE
    -- Like
    INSERT INTO discussion_likes (user_id, discussion_id)
    VALUES (v_user_id, p_discussion_id);
    UPDATE event_discussions
    SET likes_count = likes_count + 1
    WHERE id = p_discussion_id;
    v_is_liked := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'is_liked', v_is_liked,
    'discussion_id', p_discussion_id
  );
END;
$$;

-- Function to check in to an event
CREATE OR REPLACE FUNCTION checkin_to_event(
  p_event_id UUID,
  p_latitude REAL,
  p_longitude REAL,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_event RECORD;
  v_distance_meters INTEGER;
  v_is_verified BOOLEAN;
  v_checkin_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get event location
  SELECT latitude, longitude INTO v_event
  FROM events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Calculate distance from venue (if event has coordinates)
  IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
    v_distance_meters := (
      6371000 * acos(
        cos(radians(p_latitude)) * cos(radians(v_event.latitude)) *
        cos(radians(v_event.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(v_event.latitude))
      )
    )::INTEGER;

    -- Verify if within 500m (0.3 miles) of venue
    v_is_verified := v_distance_meters <= 500;
  ELSE
    v_distance_meters := NULL;
    v_is_verified := FALSE; -- Can't verify without venue coordinates
  END IF;

  -- Insert or update check-in
  INSERT INTO event_checkins (
    event_id,
    user_id,
    checkin_latitude,
    checkin_longitude,
    distance_from_venue_meters,
    is_verified,
    checkin_message
  )
  VALUES (
    p_event_id,
    v_user_id,
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_is_verified,
    p_message
  )
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET
    checkin_latitude = EXCLUDED.checkin_latitude,
    checkin_longitude = EXCLUDED.checkin_longitude,
    distance_from_venue_meters = EXCLUDED.distance_from_venue_meters,
    is_verified = EXCLUDED.is_verified,
    checkin_message = EXCLUDED.checkin_message,
    created_at = NOW()
  RETURNING id INTO v_checkin_id;

  -- Log activity
  INSERT INTO activity_feed (user_id, activity_type, event_id, metadata)
  VALUES (
    v_user_id,
    'event_checkin',
    p_event_id,
    jsonb_build_object('is_verified', v_is_verified)
  );

  RETURN jsonb_build_object(
    'checkin_id', v_checkin_id,
    'is_verified', v_is_verified,
    'distance_meters', v_distance_meters
  );
END;
$$;

-- Function to get activity feed
CREATE OR REPLACE FUNCTION get_activity_feed(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  activity_type TEXT,
  event_id UUID,
  event_title TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    af.id,
    af.user_id,
    p.first_name || ' ' || p.last_name AS user_name,
    af.activity_type,
    af.event_id,
    e.title AS event_title,
    af.metadata,
    af.created_at
  FROM activity_feed af
  JOIN profiles p ON p.id = af.user_id
  LEFT JOIN events e ON e.id = af.event_id
  WHERE (p_user_id IS NULL OR af.user_id = p_user_id)
    OR (
      p_user_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM user_follows
        WHERE follower_id = p_user_id
          AND following_id = af.user_id
      )
    )
  ORDER BY af.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION toggle_discussion_like TO authenticated;
GRANT EXECUTE ON FUNCTION checkin_to_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_feed TO authenticated, anon;

-- Add comments
COMMENT ON TABLE public.event_discussions IS
'Event comments and threaded discussions';

COMMENT ON TABLE public.event_photos IS
'User-submitted photos from events';

COMMENT ON TABLE public.event_checkins IS
'Location-verified event attendance check-ins';

COMMENT ON TABLE public.activity_feed IS
'Aggregated social activity for news feed';

COMMENT ON TABLE public.user_follows IS
'Social connections between users';

COMMENT ON FUNCTION toggle_discussion_like IS
'Like or unlike an event discussion/comment';

COMMENT ON FUNCTION checkin_to_event IS
'Check in to an event with location verification';

COMMENT ON FUNCTION get_activity_feed IS
'Get activity feed for user and their followed users';
