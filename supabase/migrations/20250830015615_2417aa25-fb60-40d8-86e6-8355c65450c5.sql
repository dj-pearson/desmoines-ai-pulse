-- Create user friends table for social connections
CREATE TABLE IF NOT EXISTS public.user_friends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Create user locations table for proximity-based features
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  latitude NUMERIC,
  longitude NUMERIC,
  city TEXT,
  state TEXT,
  is_public BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create event invitations table
CREATE TABLE IF NOT EXISTS public.event_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, inviter_id, invitee_id)
);

-- Enable RLS on all tables
ALTER TABLE public.user_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_friends
DO $$ BEGIN
  CREATE POLICY "Users can view their own friendships"
  ON public.user_friends
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create friend requests"
  ON public.user_friends
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own friend requests"
  ON public.user_friends
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own friendships"
  ON public.user_friends
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS policies for user_locations
DO $$ BEGIN
  CREATE POLICY "Users can view public locations"
  ON public.user_locations
  FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own location"
  ON public.user_locations
  FOR ALL
  USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS policies for event_invitations
DO $$ BEGIN
  CREATE POLICY "Users can view invitations they sent or received"
  ON public.event_invitations
  FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create event invitations"
  ON public.event_invitations
  FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Invitees can update invitation status"
  ON public.event_invitations
  FOR UPDATE
  USING (auth.uid() = invitee_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_friends_user_id ON public.user_friends(user_id);
CREATE INDEX IF NOT EXISTS idx_user_friends_friend_id ON public.user_friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_user_friends_status ON public.user_friends(status);
CREATE INDEX IF NOT EXISTS idx_user_locations_coordinates ON public.user_locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_event_invitations_event_id ON public.event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_invitee_id ON public.event_invitations(invitee_id);

-- Function to get friends near an event location
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    CREATE OR REPLACE FUNCTION public.get_friends_near_event(
      p_user_id UUID,
      p_event_latitude NUMERIC,
      p_event_longitude NUMERIC,
      p_radius_km INTEGER DEFAULT 50
    )
    RETURNS TABLE(
      friend_id UUID,
      friend_name TEXT,
      distance_km NUMERIC
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $func$
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
    $func$;
  END IF;
END $$;

-- Enable realtime for social tables
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_friends;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.event_invitations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;