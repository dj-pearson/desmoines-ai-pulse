-- Create social media posts tracking table
CREATE TABLE IF NOT EXISTS public.social_media_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'restaurant', 'general')),
  content_id UUID,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event_of_the_day', 'restaurant_of_the_day', 'weekly_highlight', 'special_announcement')),
  platform_type TEXT NOT NULL CHECK (platform_type IN ('twitter_threads', 'facebook_linkedin')),
  post_content TEXT NOT NULL,
  post_title TEXT,
  content_url TEXT,
  webhook_urls JSONB DEFAULT '[]'::jsonb,
  posted_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  ai_prompt_used TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.social_media_posts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admin access for social media posts" ON public.social_media_posts 
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_social_media_posts_content ON public.social_media_posts(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_status ON public.social_media_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_scheduled ON public.social_media_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_created_at ON public.social_media_posts(created_at DESC);

-- Create webhook configurations table
CREATE TABLE IF NOT EXISTS public.social_media_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.social_media_webhooks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admin access for webhooks" ON public.social_media_webhooks 
FOR ALL USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Add trigger for updated_at
CREATE TRIGGER update_social_media_posts_updated_at
  BEFORE UPDATE ON public.social_media_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_media_webhooks_updated_at
  BEFORE UPDATE ON public.social_media_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function for optimal posting times (9 AM - 6 PM weekdays, 10 AM - 4 PM weekends)
CREATE OR REPLACE FUNCTION public.get_next_optimal_posting_time(base_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ AS $$
DECLARE
  next_time TIMESTAMPTZ;
  day_of_week INTEGER;
  hour_of_day INTEGER;
BEGIN
  next_time := base_time;
  
  LOOP
    day_of_week := EXTRACT(DOW FROM next_time); -- 0=Sunday, 6=Saturday
    hour_of_day := EXTRACT(HOUR FROM next_time);
    
    -- Check if current time is within optimal posting hours
    IF (day_of_week BETWEEN 1 AND 5 AND hour_of_day BETWEEN 9 AND 18) OR  -- Weekdays 9AM-6PM
       (day_of_week IN (0, 6) AND hour_of_day BETWEEN 10 AND 16) THEN     -- Weekends 10AM-4PM
      RETURN next_time;
    END IF;
    
    -- Move to next hour
    next_time := next_time + INTERVAL '1 hour';
    
    -- Skip to next business day if it's too late
    IF day_of_week BETWEEN 1 AND 5 AND hour_of_day >= 18 THEN
      next_time := DATE_TRUNC('day', next_time) + INTERVAL '1 day 9 hours';
    ELSIF day_of_week IN (0, 6) AND hour_of_day >= 16 THEN
      next_time := DATE_TRUNC('day', next_time) + INTERVAL '1 day 10 hours';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;