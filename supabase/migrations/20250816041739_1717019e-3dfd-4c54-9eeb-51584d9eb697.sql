-- Create storage bucket for user photos (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for photo uploads (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload event photos'
  ) THEN
    CREATE POLICY "Users can upload event photos" 
    ON storage.objects 
    FOR INSERT 
    WITH CHECK (bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Event photos are publicly accessible'
  ) THEN
    CREATE POLICY "Event photos are publicly accessible" 
    ON storage.objects 
    FOR SELECT 
    USING (bucket_id = 'event-photos');
  END IF;
END $$;

-- Create discussion forums table (if not exists)
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

-- Create discussion threads table (if not exists)
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

-- Create discussion replies table (if not exists)
CREATE TABLE IF NOT EXISTS public.discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.discussion_threads(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  parent_reply_id UUID REFERENCES public.discussion_replies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user locations table for nearby features (if not exists)
CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.discussion_forums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for discussion forums
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_forums' 
    AND policyname = 'Anyone can view public forums'
  ) THEN
    CREATE POLICY "Anyone can view public forums" 
    ON public.discussion_forums 
    FOR SELECT 
    USING (is_public = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_forums' 
    AND policyname = 'Authenticated users can create forums'
  ) THEN
    CREATE POLICY "Authenticated users can create forums" 
    ON public.discussion_forums 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for discussion threads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_threads' 
    AND policyname = 'Anyone can view threads in public forums'
  ) THEN
    CREATE POLICY "Anyone can view threads in public forums" 
    ON public.discussion_threads 
    FOR SELECT 
    USING (EXISTS (
      SELECT 1 FROM public.discussion_forums 
      WHERE id = forum_id AND is_public = true
    ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_threads' 
    AND policyname = 'Authenticated users can create threads'
  ) THEN
    CREATE POLICY "Authenticated users can create threads" 
    ON public.discussion_threads 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for discussion replies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_replies' 
    AND policyname = 'Anyone can view replies in public forum threads'
  ) THEN
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'discussion_replies' 
    AND policyname = 'Authenticated users can create replies'
  ) THEN
    CREATE POLICY "Authenticated users can create replies" 
    ON public.discussion_replies 
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);
  END IF;
END $$;

-- Create RLS policies for user_locations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_locations' 
    AND policyname = 'Users can manage their own location'
  ) THEN
    CREATE POLICY "Users can manage their own location" 
    ON public.user_locations 
    FOR ALL 
    USING (auth.uid() = user_id);
  END IF;
END $$;