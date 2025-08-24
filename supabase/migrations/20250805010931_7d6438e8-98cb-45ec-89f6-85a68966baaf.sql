-- Create comprehensive gamification system

-- Create badges table for various achievements
CREATE TABLE public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text, -- lucide icon name
  badge_type text NOT NULL, -- 'explorer', 'social', 'contributor', 'special'
  requirements jsonb NOT NULL, -- conditions to earn badge
  points_value integer NOT NULL DEFAULT 0,
  rarity text NOT NULL DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Create user badges earned table
CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id),
  earned_at timestamp with time zone DEFAULT now(),
  progress jsonb DEFAULT '{}', -- for tracking progress toward badge
  UNIQUE(user_id, badge_id)
);

-- Create community challenges table
CREATE TABLE public.community_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  challenge_type text NOT NULL, -- 'photo_contest', 'explorer', 'social', 'review'
  requirements jsonb NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  max_participants integer,
  reward_points integer DEFAULT 0,
  reward_badges uuid[], -- array of badge IDs
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- Create user challenge participation table
CREATE TABLE public.user_challenge_participation (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.community_challenges(id),
  progress jsonb DEFAULT '{}',
  completed_at timestamp with time zone,
  submission_data jsonb, -- photos, reviews, etc.
  points_earned integer DEFAULT 0,
  rank integer,
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

-- Create user activity tracking for XP
CREATE TABLE public.user_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  activity_type text NOT NULL, -- 'visit_venue', 'write_review', 'upload_photo', 'share_event', etc.
  content_type text, -- 'restaurant', 'event', 'attraction'
  content_id uuid,
  points_earned integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- Enhanced user reputation table (update existing)
DO $$
BEGIN
  -- Add new columns to existing user_reputation table
  ALTER TABLE public.user_reputation 
  ADD COLUMN IF NOT EXISTS experience_points integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_level_progress integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_level_xp integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS total_badges integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_position integer,
  ADD COLUMN IF NOT EXISTS streak_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date date;
END $$;

-- Create function to calculate required XP for level
CREATE OR REPLACE FUNCTION public.calculate_level_xp(level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Exponential curve: level 1=100, level 2=250, level 3=450, etc.
  RETURN (level * 100) + ((level - 1) * 50);
END;
$$;

-- Create function to get user level from XP
CREATE OR REPLACE FUNCTION public.get_level_from_xp(xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  level integer := 1;
  required_xp integer;
BEGIN
  LOOP
    required_xp := public.calculate_level_xp(level);
    IF xp < required_xp THEN
      RETURN level - 1;
    END IF;
    level := level + 1;
    IF level > 100 THEN -- Cap at level 100
      RETURN 100;
    END IF;
  END LOOP;
END;
$$;

-- Create function to update user level and progress
CREATE OR REPLACE FUNCTION public.update_user_gamification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  total_xp integer;
  user_level integer;
  current_level_start_xp integer;
  next_level_xp integer;
  progress_in_level integer;
  badge_count integer;
BEGIN
  -- Calculate total XP from activities
  SELECT COALESCE(SUM(points_earned), 0) INTO total_xp
  FROM public.user_activities
  WHERE user_id = p_user_id;
  
  -- Add XP from earned badges
  SELECT COALESCE(SUM(b.points_value), 0) INTO total_xp
  FROM public.user_badges ub
  JOIN public.badges b ON ub.badge_id = b.id
  WHERE ub.user_id = p_user_id;
  
  -- Calculate level
  user_level := GREATEST(1, public.get_level_from_xp(total_xp));
  
  -- Calculate progress within current level
  current_level_start_xp := CASE 
    WHEN user_level = 1 THEN 0
    ELSE public.calculate_level_xp(user_level)
  END;
  
  next_level_xp := public.calculate_level_xp(user_level + 1);
  progress_in_level := total_xp - current_level_start_xp;
  
  -- Count badges
  SELECT COUNT(*) INTO badge_count
  FROM public.user_badges
  WHERE user_id = p_user_id;
  
  -- Update user reputation record
  INSERT INTO public.user_reputation (
    user_id, 
    experience_points,
    current_level,
    current_level_progress,
    next_level_xp,
    total_badges,
    updated_at
  )
  VALUES (
    p_user_id,
    total_xp,
    user_level,
    progress_in_level,
    next_level_xp - current_level_start_xp,
    badge_count,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    experience_points = total_xp,
    current_level = user_level,
    current_level_progress = progress_in_level,
    next_level_xp = next_level_xp - current_level_start_xp,
    total_badges = badge_count,
    updated_at = now();
END;
$$;

-- Create function to award XP for activities
CREATE OR REPLACE FUNCTION public.award_user_xp(
  p_user_id uuid,
  p_activity_type text,
  p_points integer,
  p_content_type text DEFAULT NULL,
  p_content_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert activity record
  INSERT INTO public.user_activities (
    user_id, activity_type, content_type, content_id, points_earned, metadata
  ) VALUES (
    p_user_id, p_activity_type, p_content_type, p_content_id, p_points, p_metadata
  );
  
  -- Update user gamification stats
  PERFORM public.update_user_gamification(p_user_id);
END;
$$;

-- Insert sample badges
INSERT INTO public.badges (name, description, icon, badge_type, requirements, points_value, rarity) VALUES
('First Steps', 'Welcome to Des Moines! Complete your first activity.', 'MapPin', 'explorer', '{"activities": 1}', 50, 'common'),
('Restaurant Explorer', 'Visit 5 different restaurants', 'UtensilsCrossed', 'explorer', '{"restaurant_visits": 5}', 100, 'common'),
('Event Enthusiast', 'Attend 3 events', 'Calendar', 'social', '{"event_attendance": 3}', 100, 'common'),
('Photo Contest Winner', 'Win a weekly photo contest', 'Camera', 'social', '{"photo_contest_wins": 1}', 200, 'rare'),
('Review Master', 'Write 10 helpful reviews', 'Star', 'contributor', '{"reviews_written": 10}', 150, 'common'),
('Des Moines Insider', 'Reach level 10', 'Crown', 'special', '{"level": 10}', 500, 'epic'),
('Neighborhood Champion', 'Visit venues in 5 different neighborhoods', 'Home', 'explorer', '{"neighborhoods_visited": 5}', 200, 'rare'),
('Social Butterfly', 'Share 20 events or venues', 'Share2', 'social', '{"shares": 20}', 150, 'common'),
('Early Bird', 'Be among the first 10 to try a new restaurant', 'Sunrise', 'explorer', '{"early_restaurant_visits": 1}', 300, 'epic'),
('Legendary Explorer', 'Visit 50 different venues', 'Trophy', 'explorer', '{"venue_visits": 50}', 1000, 'legendary');

-- Insert sample community challenge
INSERT INTO public.community_challenges (
  title, description, challenge_type, requirements, 
  start_date, end_date, reward_points, is_active
) VALUES (
  'Winter Warmth Photo Contest',
  'Share your coziest Des Moines restaurant photos! Show us where you go to warm up during winter.',
  'photo_contest',
  '{"photos_required": 1, "venue_type": "restaurant", "theme": "cozy_winter"}',
  NOW(),
  NOW() + INTERVAL '7 days',
  250,
  true
);

-- Enable RLS on new tables
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenge_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can view active badges" ON public.badges
FOR SELECT USING (is_active = true);

CREATE POLICY "Users can view their own badges" ON public.user_badges
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can manage user badges" ON public.user_badges
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can view active challenges" ON public.community_challenges
FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage challenges" ON public.community_challenges
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Users can view their own participation" ON public.user_challenge_participation
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can join challenges" ON public.user_challenge_participation
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON public.user_challenge_participation
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own activities" ON public.user_activities
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can manage activities" ON public.user_activities
FOR ALL USING (auth.role() = 'service_role');