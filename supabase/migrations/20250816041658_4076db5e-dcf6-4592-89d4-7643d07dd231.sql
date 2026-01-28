-- Create storage bucket for user photos
INSERT INTO storage.buckets (id, name, public) 
SELECT 'event-photos', 'event-photos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'event-photos');

INSERT INTO storage.buckets (id, name, public) 
SELECT 'user-uploads', 'user-uploads', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'user-uploads');

-- Create storage policies for photo uploads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload event photos') THEN
    CREATE POLICY "Users can upload event photos" 
    ON storage.objects 
    FOR INSERT 
    WITH CHECK (bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Event photos are publicly accessible') THEN
    CREATE POLICY "Event photos are publicly accessible" 
    ON storage.objects 
    FOR SELECT 
    USING (bucket_id = 'event-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can manage their own uploads') THEN
    CREATE POLICY "Users can manage their own uploads" 
    ON storage.objects 
    FOR ALL 
    USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- Create user friends table
CREATE TABLE IF NOT EXISTS public.user_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Create user calendars table
CREATE TABLE IF NOT EXISTS public.user_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  calendar_name TEXT NOT NULL,
  calendar_type TEXT NOT NULL DEFAULT 'personal',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create discussion forums table
CREATE TABLE IF NOT EXISTS public.discussion_forums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create discussion threads table
CREATE TABLE IF NOT EXISTS public.discussion_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forum_id UUID REFERENCES public.discussion_forums(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create discussion replies table
CREATE TABLE IF NOT EXISTS public.discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.discussion_threads(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  parent_reply_id UUID REFERENCES public.discussion_replies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user locations table for nearby features
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
DO $$ BEGIN
  ALTER TABLE public.user_friends ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_calendars ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

DO $$ BEGIN
  ALTER TABLE public.discussion_forums ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

DO $$ BEGIN
  ALTER TABLE public.discussion_threads ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

DO $$ BEGIN
  ALTER TABLE public.discussion_replies ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet
END $$;

-- Create RLS policies for user_friends
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_friends' AND policyname = 'Users can view their own friends and pending requests') THEN
    CREATE POLICY "Users can view their own friends and pending requests" 
    ON public.user_friends 
    FOR SELECT 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_friends' AND policyname = 'Users can send friend requests') THEN
    CREATE POLICY "Users can send friend requests" 
    ON public.user_friends 
    FOR INSERT 
    WITH CHECK (auth.uid() = requested_by AND (auth.uid() = user_id OR auth.uid() = friend_id));
  END IF;
EXCEPTION WHEN undefined_column THEN
  -- Column doesn't exist, skip policy
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_friends' AND policyname = 'Users can respond to friend requests') THEN
    CREATE POLICY "Users can respond to friend requests" 
    ON public.user_friends 
    FOR UPDATE 
    USING (auth.uid() = user_id OR auth.uid() = friend_id);
  END IF;
END $$;

-- Create RLS policies for user_calendars
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_calendars' AND policyname = 'Users can manage their own calendars') THEN
    CREATE POLICY "Users can manage their own calendars" 
    ON public.user_calendars 
    FOR ALL 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create RLS policies for discussion forums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_forums' AND policyname = 'Anyone can view public forums') THEN
    CREATE POLICY "Anyone can view public forums" 
    ON public.discussion_forums 
    FOR SELECT 
    USING (is_public = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_forums' AND policyname = 'Authenticated users can create forums') THEN
    CREATE POLICY "Authenticated users can create forums" 
    ON public.discussion_forums 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_forums' AND policyname = 'Forum creators can update their forums') THEN
    CREATE POLICY "Forum creators can update their forums" 
    ON public.discussion_forums 
    FOR UPDATE 
    USING (auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for discussion threads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_threads' AND policyname = 'Anyone can view threads in public forums') THEN
    CREATE POLICY "Anyone can view threads in public forums" 
    ON public.discussion_threads 
    FOR SELECT 
    USING (EXISTS (
      SELECT 1 FROM public.discussion_forums 
      WHERE id = forum_id AND is_public = true
    ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_threads' AND policyname = 'Authenticated users can create threads') THEN
    CREATE POLICY "Authenticated users can create threads" 
    ON public.discussion_threads 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_threads' AND policyname = 'Thread creators can update their threads') THEN
    CREATE POLICY "Thread creators can update their threads" 
    ON public.discussion_threads 
    FOR UPDATE 
    USING (auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for discussion replies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_replies' AND policyname = 'Anyone can view replies in public forum threads') THEN
    CREATE POLICY "Anyone can view replies in public forum threads" 
    ON public.discussion_replies 
    FOR SELECT 
    USING (EXISTS (
      SELECT 1 FROM public.discussion_threads dt
      JOIN public.discussion_forums df ON dt.forum_id = df.id
      WHERE dt.id = thread_id AND df.is_public = true
    ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_replies' AND policyname = 'Authenticated users can create replies') THEN
    CREATE POLICY "Authenticated users can create replies" 
    ON public.discussion_replies 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discussion_replies' AND policyname = 'Reply creators can update their replies') THEN
    CREATE POLICY "Reply creators can update their replies" 
    ON public.discussion_replies 
    FOR UPDATE 
    USING (auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for user_locations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_locations' AND policyname = 'Users can manage their own location') THEN
    CREATE POLICY "Users can manage their own location" 
    ON public.user_locations 
    FOR ALL 
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_locations' AND policyname = 'Anyone can view public locations') THEN
    CREATE POLICY "Anyone can view public locations" 
    ON public.user_locations 
    FOR SELECT 
    USING (is_public = true);
  END IF;
END $$;

-- Create triggers for updated_at timestamps
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_friends_updated_at') THEN
    CREATE TRIGGER update_user_friends_updated_at
      BEFORE UPDATE ON public.user_friends
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_calendars_updated_at') THEN
    CREATE TRIGGER update_user_calendars_updated_at
      BEFORE UPDATE ON public.user_calendars
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_discussion_forums_updated_at') THEN
    CREATE TRIGGER update_discussion_forums_updated_at
      BEFORE UPDATE ON public.discussion_forums
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_discussion_threads_updated_at') THEN
    CREATE TRIGGER update_discussion_threads_updated_at
      BEFORE UPDATE ON public.discussion_threads
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_discussion_replies_updated_at') THEN
    CREATE TRIGGER update_discussion_replies_updated_at
      BEFORE UPDATE ON public.discussion_replies
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_locations_updated_at') THEN
    CREATE TRIGGER update_user_locations_updated_at
      BEFORE UPDATE ON public.user_locations
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist, skip
END $$;