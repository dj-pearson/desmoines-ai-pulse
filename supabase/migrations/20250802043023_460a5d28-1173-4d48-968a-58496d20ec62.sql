-- Social & Collaborative Features Migration
-- This creates the foundation for friend groups, real-time collaboration, UGC, and social discovery

-- Friends and Social Network
CREATE TABLE public.user_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- Friend Groups for Planning
CREATE TABLE public.friend_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.friend_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.friend_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Real-time Group Planning Sessions
CREATE TABLE public.group_planning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.friend_groups(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  active_users JSONB DEFAULT '[]'::jsonb,
  selected_events JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  voting_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

-- User-Generated Content: Event Photos
CREATE TABLE public.event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_approved BOOLEAN DEFAULT false,
  helpful_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User-Generated Content: Event Tips & Reviews
CREATE TABLE public.event_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tip_text TEXT NOT NULL,
  tip_category TEXT CHECK (tip_category IN ('parking', 'food', 'timing', 'what_to_bring', 'accessibility', 'other')),
  helpful_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.event_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_text TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  attended BOOLEAN DEFAULT false,
  helpful_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Event Attendance & Social Proof
CREATE TABLE public.event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested', 'going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Social Metrics for Events
CREATE TABLE public.event_social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_views INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  total_saves INTEGER DEFAULT 0,
  going_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,
  trending_score NUMERIC DEFAULT 0,
  social_buzz_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, date)
);

-- User Location for Friend Discovery
CREATE TABLE public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  location_name TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Helpful Votes for UGC
CREATE TABLE public.content_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('tip', 'review', 'photo')),
  content_id UUID NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_type, content_id)
);

-- Enable RLS on all tables
ALTER TABLE public.user_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_planning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_helpful_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Friends
CREATE POLICY "Users can view their own friends and incoming requests" ON public.user_friends
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friend requests" ON public.user_friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their friend relationships" ON public.user_friends
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- RLS Policies for Friend Groups
CREATE POLICY "Users can view groups they're members of or public groups" ON public.friend_groups
  FOR SELECT USING (
    is_public = true OR 
    created_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = id AND user_id = auth.uid())
  );

CREATE POLICY "Users can create their own groups" ON public.friend_groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators and admins can update groups" ON public.friend_groups
  FOR UPDATE USING (
    created_by = auth.uid() OR 
    EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = id AND user_id = auth.uid() AND role = 'admin')
  );

-- RLS Policies for Group Members
CREATE POLICY "Users can view group memberships for groups they can see" ON public.friend_group_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.friend_groups WHERE id = group_id AND (
      is_public = true OR 
      created_by = auth.uid() OR 
      EXISTS (SELECT 1 FROM public.friend_group_members m2 WHERE m2.group_id = group_id AND m2.user_id = auth.uid())
    ))
  );

CREATE POLICY "Group admins can manage members" ON public.friend_group_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.friend_groups WHERE id = group_id AND created_by = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = friend_group_members.group_id AND user_id = auth.uid() AND role = 'admin')
  );

-- RLS Policies for Planning Sessions
CREATE POLICY "Group members can view planning sessions" ON public.group_planning_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = group_planning_sessions.group_id AND user_id = auth.uid())
  );

CREATE POLICY "Group members can create and update planning sessions" ON public.group_planning_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = group_planning_sessions.group_id AND user_id = auth.uid())
  );

-- RLS Policies for User-Generated Content
CREATE POLICY "Anyone can view approved photos" ON public.event_photos
  FOR SELECT USING (is_approved = true);

CREATE POLICY "Users can create their own photos" ON public.event_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all tips and reviews" ON public.event_tips
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own tips" ON public.event_tips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all reviews" ON public.event_reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own reviews" ON public.event_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" ON public.event_reviews
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for Attendance
CREATE POLICY "Users can view all attendance" ON public.event_attendance
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own attendance" ON public.event_attendance
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for Social Metrics
CREATE POLICY "Anyone can view social metrics" ON public.event_social_metrics
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage social metrics" ON public.event_social_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for User Locations
CREATE POLICY "Users can view public locations and their own" ON public.user_locations
  FOR SELECT USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can manage their own location" ON public.user_locations
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for Helpful Votes
CREATE POLICY "Users can view all helpful votes" ON public.content_helpful_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own votes" ON public.content_helpful_votes
  FOR ALL USING (auth.uid() = user_id);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_friend_groups_updated_at
  BEFORE UPDATE ON public.friend_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_group_planning_sessions_updated_at
  BEFORE UPDATE ON public.group_planning_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_attendance_updated_at
  BEFORE UPDATE ON public.event_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_locations_updated_at
  BEFORE UPDATE ON public.user_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate social buzz score
CREATE OR REPLACE FUNCTION public.calculate_social_buzz_score(
  views_count INTEGER,
  shares_count INTEGER,
  saves_count INTEGER,
  going_count INTEGER,
  interested_count INTEGER
) RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    (views_count * 0.1) +
    (shares_count * 2.0) +
    (saves_count * 1.5) +
    (going_count * 3.0) +
    (interested_count * 1.0)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get friends near an event
CREATE OR REPLACE FUNCTION public.get_friends_near_event(
  p_user_id UUID,
  p_event_latitude DECIMAL,
  p_event_longitude DECIMAL,
  p_radius_km INTEGER DEFAULT 50
) RETURNS TABLE (
  friend_id UUID,
  friend_name TEXT,
  distance_km NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uf.friend_id,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as friend_name,
    (
      6371 * acos(
        cos(radians(p_event_latitude)) * cos(radians(ul.latitude)) *
        cos(radians(ul.longitude) - radians(p_event_longitude)) +
        sin(radians(p_event_latitude)) * sin(radians(ul.latitude))
      )
    )::NUMERIC as distance_km
  FROM public.user_friends uf
  JOIN public.profiles p ON p.user_id = uf.friend_id
  JOIN public.user_locations ul ON ul.user_id = uf.friend_id
  WHERE uf.user_id = p_user_id 
    AND uf.status = 'accepted'
    AND ul.is_public = true
    AND (
      6371 * acos(
        cos(radians(p_event_latitude)) * cos(radians(ul.latitude)) *
        cos(radians(ul.longitude) - radians(p_event_longitude)) +
        sin(radians(p_event_latitude)) * sin(radians(ul.latitude))
      )
    ) <= p_radius_km
  ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for collaboration tables
ALTER TABLE public.group_planning_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.event_attendance REPLICA IDENTITY FULL;
ALTER TABLE public.event_social_metrics REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_planning_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_social_metrics;