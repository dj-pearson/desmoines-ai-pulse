-- Create weekend_guides table for storing AI-generated weekend content
CREATE TABLE IF NOT EXISTS public.weekend_guides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  content TEXT NOT NULL,
  events_count INTEGER DEFAULT 0,
  events_featured JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.weekend_guides ENABLE ROW LEVEL SECURITY;

-- Allow public read access to weekend guides
CREATE POLICY "Weekend guides are publicly readable" 
ON public.weekend_guides FOR SELECT 
USING (true);

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read weekend guides" 
ON public.weekend_guides FOR SELECT 
TO authenticated 
USING (true);

-- Only admins can modify weekend guides
CREATE POLICY "Only admins can modify weekend guides" 
ON public.weekend_guides FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'root_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'root_admin')
  )
);

-- Create index for efficient week lookups
CREATE INDEX IF NOT EXISTS idx_weekend_guides_week_start 
ON public.weekend_guides(week_start DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_weekend_guides_updated_at
  BEFORE UPDATE ON public.weekend_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create CRON job to run every Sunday at 9 PM CDT (2 AM UTC Monday)
-- This will generate content for the upcoming weekend
SELECT cron.schedule(
  'generate-weekend-guide',
  '0 2 * * 1', -- Every Monday at 2 AM UTC (Sunday 9 PM CDT)
  $$
  SELECT net.http_post(
    url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-weekend-guide',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'x-point', 'cron-trigger'
    ),
    body := jsonb_build_object(
      'trigger', 'cron',
      'timestamp', now()
    )::text
  );
  $$
);

-- Log the CRON job creation
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('Weekend guide CRON job created - runs every Sunday at 9 PM CDT', NOW());