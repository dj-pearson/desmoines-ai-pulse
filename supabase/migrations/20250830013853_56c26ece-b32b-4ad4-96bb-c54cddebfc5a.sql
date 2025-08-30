-- Create event photos table for organized photo galleries
CREATE TABLE public.event_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_featured BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create photo reactions table
CREATE TABLE public.event_photo_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reaction_type TEXT DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(photo_id, user_id)
);

-- Enable RLS on event photos
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for event photos
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

-- Enable RLS on photo reactions
ALTER TABLE public.event_photo_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for photo reactions
CREATE POLICY "Anyone can view photo reactions"
ON public.event_photo_reactions
FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reactions"
ON public.event_photo_reactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
ON public.event_photo_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX idx_event_photos_event_id ON public.event_photos(event_id);
CREATE INDEX idx_event_photos_user_id ON public.event_photos(user_id);
CREATE INDEX idx_event_photos_created_at ON public.event_photos(created_at DESC);
CREATE INDEX idx_event_photo_reactions_photo_id ON public.event_photo_reactions(photo_id);

-- Create storage bucket for event photos if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for event photos
CREATE POLICY "Public read access for event photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'event-photos');

CREATE POLICY "Authenticated users can upload event photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'event-photos' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update their own event photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'event-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own event photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'event-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Function to update photo likes count
CREATE OR REPLACE FUNCTION public.update_photo_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.event_photos 
    SET likes_count = likes_count + 1
    WHERE id = NEW.photo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.event_photos 
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.photo_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger to update photo likes count
CREATE TRIGGER trigger_update_photo_likes_count
  AFTER INSERT OR DELETE ON public.event_photo_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_photo_likes_count();

-- Enable realtime for photo tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_photo_reactions;