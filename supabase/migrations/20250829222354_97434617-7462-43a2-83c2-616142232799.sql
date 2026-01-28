-- Real-Time Social Event Hub Tables

-- Event Check-ins and Attendance Tracking
CREATE TABLE IF NOT EXISTS public.event_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  location_verified BOOLEAN DEFAULT false,
  check_in_method TEXT DEFAULT 'manual', -- 'manual', 'qr_code', 'geofence'
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Live Event Discussions/Comments
CREATE TABLE IF NOT EXISTS public.event_discussions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'comment', -- 'comment', 'photo', 'video', 'tip'
  media_url TEXT,
  parent_id UUID REFERENCES public.event_discussions(id), -- For replies
  is_live BOOLEAN DEFAULT true, -- Show in live feed
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Real-time Event Capacity and Stats
CREATE TABLE IF NOT EXISTS public.event_live_stats (
  event_id UUID NOT NULL PRIMARY KEY,
  current_attendees INTEGER DEFAULT 0,
  total_checkins INTEGER DEFAULT 0,
  discussion_count INTEGER DEFAULT 0,
  photos_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),
  trending_score INTEGER DEFAULT 0,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Event Relationships (Going/Interested/Maybe)
CREATE TABLE IF NOT EXISTS public.event_attendees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'interested', -- 'going', 'interested', 'maybe'
  visibility TEXT DEFAULT 'public', -- 'public', 'friends_only', 'private'
  notification_preferences JSONB DEFAULT '{"reminders": true, "updates": true, "social": true}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Live Event Feed Items (aggregated social content)
CREATE TABLE IF NOT EXISTS public.event_live_feed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL, -- 'checkin', 'photo', 'comment', 'rating', 'tip'
  content TEXT,
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_highlighted BOOLEAN DEFAULT false, -- Featured content
  engagement_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Event Discussion Likes/Reactions
CREATE TABLE IF NOT EXISTS public.event_discussion_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discussion_id UUID NOT NULL REFERENCES public.event_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction_type TEXT DEFAULT 'like', -- 'like', 'love', 'laugh', 'wow'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(discussion_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_live_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_live_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_discussion_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Event Check-ins
CREATE POLICY "Users can view public event checkins" ON public.event_checkins
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own checkins" ON public.event_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checkins" ON public.event_checkins
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for Event Discussions
CREATE POLICY "Anyone can view event discussions" ON public.event_discussions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create discussions" ON public.event_discussions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discussions" ON public.event_discussions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discussions" ON public.event_discussions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Event Live Stats (read-only for users)
CREATE POLICY "Anyone can view event live stats" ON public.event_live_stats
  FOR SELECT USING (true);

-- RLS Policies for Event Attendees
CREATE POLICY "Users can view public attendee status" ON public.event_attendees
  FOR SELECT USING (visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "Users can manage their own attendee status" ON public.event_attendees
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendee status" ON public.event_attendees
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attendee status" ON public.event_attendees
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Event Live Feed
CREATE POLICY "Anyone can view event live feed" ON public.event_live_feed
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create feed items" ON public.event_live_feed
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for Discussion Reactions
CREATE POLICY "Anyone can view discussion reactions" ON public.event_discussion_reactions
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own reactions" ON public.event_discussion_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reactions" ON public.event_discussion_reactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions" ON public.event_discussion_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_event_checkins_event_id ON public.event_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_event_checkins_user_id ON public.event_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_event_checkins_created_at ON public.event_checkins(created_at);

CREATE INDEX IF NOT EXISTS idx_event_discussions_event_id ON public.event_discussions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_discussions_user_id ON public.event_discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_event_discussions_created_at ON public.event_discussions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON public.event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON public.event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_status ON public.event_attendees(status);

CREATE INDEX IF NOT EXISTS idx_event_live_feed_event_id ON public.event_live_feed(event_id);
CREATE INDEX IF NOT EXISTS idx_event_live_feed_created_at ON public.event_live_feed(created_at DESC);

-- Functions for Real-time Updates
CREATE OR REPLACE FUNCTION update_event_live_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update event live stats when checkins, discussions, or attendees change
  INSERT INTO public.event_live_stats (
    event_id,
    current_attendees,
    total_checkins,
    discussion_count,
    last_activity
  )
  SELECT 
    e.id as event_id,
    COALESCE(attendee_counts.going_count, 0) as current_attendees,
    COALESCE(checkin_counts.total_checkins, 0) as total_checkins,
    COALESCE(discussion_counts.discussion_count, 0) as discussion_count,
    now() as last_activity
  FROM public.events e
  LEFT JOIN (
    SELECT event_id, COUNT(*) as going_count 
    FROM public.event_attendees 
    WHERE status = 'going' 
    GROUP BY event_id
  ) attendee_counts ON e.id = attendee_counts.event_id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as total_checkins 
    FROM public.event_checkins 
    GROUP BY event_id
  ) checkin_counts ON e.id = checkin_counts.event_id
  LEFT JOIN (
    SELECT event_id, COUNT(*) as discussion_count 
    FROM public.event_discussions 
    GROUP BY event_id
  ) discussion_counts ON e.id = discussion_counts.event_id
  WHERE e.id = COALESCE(NEW.event_id, OLD.event_id)
  ON CONFLICT (event_id) 
  DO UPDATE SET
    current_attendees = EXCLUDED.current_attendees,
    total_checkins = EXCLUDED.total_checkins,
    discussion_count = EXCLUDED.discussion_count,
    last_activity = EXCLUDED.last_activity,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for Real-time Stats Updates
DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON public.event_checkins;
CREATE TRIGGER trigger_update_stats_on_checkin
  AFTER INSERT OR UPDATE OR DELETE ON public.event_checkins
  FOR EACH ROW EXECUTE FUNCTION update_event_live_stats();

DROP TRIGGER IF EXISTS trigger_update_stats_on_attendee ON public.event_attendees;
CREATE TRIGGER trigger_update_stats_on_attendee
  AFTER INSERT OR UPDATE OR DELETE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION update_event_live_stats();

DROP TRIGGER IF EXISTS trigger_update_stats_on_discussion ON public.event_discussions;
CREATE TRIGGER trigger_update_stats_on_discussion
  AFTER INSERT OR UPDATE OR DELETE ON public.event_discussions
  FOR EACH ROW EXECUTE FUNCTION update_event_live_stats();

-- Function to create live feed items automatically
CREATE OR REPLACE FUNCTION create_live_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Create feed item for new checkins
  IF TG_TABLE_NAME = 'event_checkins' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.event_live_feed (
      event_id, user_id, content_type, content, metadata
    ) VALUES (
      NEW.event_id, 
      NEW.user_id, 
      'checkin',
      'checked in to the event',
      jsonb_build_object('checkin_method', NEW.check_in_method)
    );
  END IF;

  -- Create feed item for new discussions
  IF TG_TABLE_NAME = 'event_discussions' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.event_live_feed (
      event_id, user_id, content_type, content, media_url, metadata
    ) VALUES (
      NEW.event_id,
      NEW.user_id,
      NEW.message_type,
      NEW.message,
      NEW.media_url,
      jsonb_build_object('discussion_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for Live Feed Generation
DROP TRIGGER IF EXISTS trigger_create_feed_on_checkin ON public.event_checkins;
CREATE TRIGGER trigger_create_feed_on_checkin
  AFTER INSERT ON public.event_checkins
  FOR EACH ROW EXECUTE FUNCTION create_live_feed_item();

DROP TRIGGER IF EXISTS trigger_create_feed_on_discussion ON public.event_discussions;
CREATE TRIGGER trigger_create_feed_on_discussion
  AFTER INSERT ON public.event_discussions
  FOR EACH ROW EXECUTE FUNCTION create_live_feed_item();

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_discussions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_live_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_attendees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_live_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_discussion_reactions;