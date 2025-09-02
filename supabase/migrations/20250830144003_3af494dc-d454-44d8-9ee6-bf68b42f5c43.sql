-- Create a table to store automation settings from the UI
CREATE TABLE IF NOT EXISTS public.social_media_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  event_time TEXT NOT NULL DEFAULT '09:00',
  restaurant_time TEXT NOT NULL DEFAULT '18:00',
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.social_media_automation_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admin access only
CREATE POLICY "Admin access only for automation settings" ON public.social_media_automation_settings
FOR ALL 
USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'root_admin')));

-- Insert default settings
INSERT INTO public.social_media_automation_settings (enabled, event_time, restaurant_time, timezone) 
VALUES (true, '09:00', '18:00', 'America/Chicago')
ON CONFLICT DO NOTHING;

-- Update the automation function to use the settings table
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_hour INTEGER;
  current_minute INTEGER;
  central_time TIMESTAMPTZ;
  last_event_post TIMESTAMPTZ;
  last_restaurant_post TIMESTAMPTZ;
  should_post_event BOOLEAN := false;
  should_post_restaurant BOOLEAN := false;
  automation_enabled BOOLEAN;
  event_hour INTEGER;
  restaurant_hour INTEGER;
BEGIN
  -- Get automation settings
  SELECT enabled, 
         EXTRACT(HOUR FROM (event_time || ':00')::TIME)::INTEGER,
         EXTRACT(HOUR FROM (restaurant_time || ':00')::TIME)::INTEGER
  INTO automation_enabled, event_hour, restaurant_hour
  FROM public.social_media_automation_settings 
  ORDER BY updated_at DESC 
  LIMIT 1;
  
  -- If no settings found or automation disabled, exit
  IF automation_enabled IS NULL OR NOT automation_enabled THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('⏸️ Social media automation is disabled or no settings found', NOW());
    RETURN;
  END IF;
  
  -- Get current Central Time
  central_time := NOW() AT TIME ZONE 'America/Chicago';
  current_hour := EXTRACT(HOUR FROM central_time)::INTEGER;
  current_minute := EXTRACT(MINUTE FROM central_time)::INTEGER;
  
  -- Log the cron job execution with current time info
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🤖 Social Media Automation Check - Central Time: ' || central_time || ' (Hour: ' || current_hour || ', Minute: ' || current_minute || ')', NOW());
  
  -- Check for event posting (configurable hour + 1.5 hour window)
  IF current_hour = event_hour OR (current_hour = (event_hour + 1) AND current_minute < 30) THEN
    -- Check last event post
    SELECT MAX(created_at) INTO last_event_post
    FROM public.social_media_posts
    WHERE content_type = 'event' AND status IN ('posted', 'scheduled');
    
    -- Post event if none posted in last 18 hours
    should_post_event := (last_event_post IS NULL OR last_event_post < NOW() - INTERVAL '18 hours');
    
    IF should_post_event THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🌅 Triggering morning event post generation (Hour: ' || current_hour || ')', NOW());
      
      -- Call social media manager to generate event post
      BEGIN
        PERFORM net.http_post(
          url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM'
          ),
          body := jsonb_build_object(
            'action', 'generate',
            'contentType', 'event',
            'subjectType', 'event_of_the_day'
          )::text
        );
        
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✅ Morning event post HTTP request sent successfully', NOW());
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Failed to send event post HTTP request', SQLERRM, NOW());
      END;
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping event post - already posted recently (last post: ' || COALESCE(last_event_post::text, 'never') || ')', NOW());
    END IF;
  END IF;
  
  -- Check for restaurant posting (configurable hour + 1.5 hour window)
  IF current_hour = restaurant_hour OR (current_hour = (restaurant_hour + 1) AND current_minute < 30) THEN
    -- Check last restaurant post
    SELECT MAX(created_at) INTO last_restaurant_post
    FROM public.social_media_posts
    WHERE content_type = 'restaurant' AND status IN ('posted', 'scheduled');
    
    -- Post restaurant if none posted in last 18 hours
    should_post_restaurant := (last_restaurant_post IS NULL OR last_restaurant_post < NOW() - INTERVAL '18 hours');
    
    IF should_post_restaurant THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🍽️ Triggering evening restaurant post generation (Hour: ' || current_hour || ')', NOW());
      
      -- Call social media manager to generate restaurant post
      BEGIN
        PERFORM net.http_post(
          url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM'
          ),
          body := jsonb_build_object(
            'action', 'generate',
            'contentType', 'restaurant',
            'subjectType', 'restaurant_of_the_day'
          )::text
        );
        
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✅ Evening restaurant post HTTP request sent successfully', NOW());
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Failed to send restaurant post HTTP request', SQLERRM, NOW());
      END;
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping restaurant post - already posted recently (last post: ' || COALESCE(last_restaurant_post::text, 'never') || ')', NOW());
    END IF;
  END IF;
  
  -- Log completion if no actions taken
  IF (current_hour NOT IN (event_hour, event_hour + 1, restaurant_hour, restaurant_hour + 1)) OR 
     (current_hour = (event_hour + 1) AND current_minute >= 30) OR 
     (current_hour = (restaurant_hour + 1) AND current_minute >= 30) THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🕐 Social media automation check completed - outside posting windows (' || event_hour || '-' || (event_hour + 1) || ':30 or ' || restaurant_hour || '-' || (restaurant_hour + 1) || ':30 Central)', NOW());
  END IF;
  
END;
$function$;