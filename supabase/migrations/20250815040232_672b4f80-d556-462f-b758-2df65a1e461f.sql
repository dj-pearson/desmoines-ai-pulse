-- Update social media automation CRON system for daily scheduling
-- Remove existing automation job if it exists
SELECT cron.unschedule('social-media-automation');

-- Create enhanced social media automation function with specific timing
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void AS $$
DECLARE
  current_hour INTEGER;
  current_minute INTEGER;
  last_event_post TIMESTAMPTZ;
  last_restaurant_post TIMESTAMPTZ;
  should_post_event BOOLEAN := false;
  should_post_restaurant BOOLEAN := false;
BEGIN
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting daily social media automation check', NOW());
  
  -- Get current Central Time hour and minute
  SELECT 
    EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Chicago')::INTEGER,
    EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'America/Chicago')::INTEGER
  INTO current_hour, current_minute;
  
  -- Check for event posting (9 AM Central Time)
  IF current_hour = 9 AND current_minute < 30 THEN
    -- Check last event post
    SELECT MAX(created_at) INTO last_event_post
    FROM public.social_media_posts
    WHERE content_type = 'event' AND status IN ('posted', 'scheduled');
    
    -- Post event if none posted in last 20 hours (to avoid double posting)
    should_post_event := (last_event_post IS NULL OR last_event_post < NOW() - INTERVAL '20 hours');
    
    IF should_post_event THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('Triggering morning event post generation', NOW());
      
      -- Call social media manager to generate event post
      PERFORM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'generate',
          'contentType', 'event',
          'subjectType', 'event_of_the_day'
        )::text
      );
      
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('✅ Morning event post triggered successfully', NOW());
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping event post - already posted recently', NOW());
    END IF;
  END IF;
  
  -- Check for restaurant posting (6 PM Central Time)
  IF current_hour = 18 AND current_minute < 30 THEN
    -- Check last restaurant post
    SELECT MAX(created_at) INTO last_restaurant_post
    FROM public.social_media_posts
    WHERE content_type = 'restaurant' AND status IN ('posted', 'scheduled');
    
    -- Post restaurant if none posted in last 20 hours (to avoid double posting)
    should_post_restaurant := (last_restaurant_post IS NULL OR last_restaurant_post < NOW() - INTERVAL '20 hours');
    
    IF should_post_restaurant THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('Triggering evening restaurant post generation', NOW());
      
      -- Call social media manager to generate restaurant post
      PERFORM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'generate',
          'contentType', 'restaurant',
          'subjectType', 'restaurant_of_the_day'
        )::text
      );
      
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('✅ Evening restaurant post triggered successfully', NOW());
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping restaurant post - already posted recently', NOW());
    END IF;
  END IF;
  
  -- Log completion if no actions taken
  IF current_hour NOT IN (9, 18) OR current_minute >= 30 THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('✅ Social media automation check completed - outside posting hours', NOW());
  END IF;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Schedule social media automation to run every 30 minutes
-- This allows for precise timing checks at 9 AM and 6 PM Central
SELECT cron.schedule(
  'daily-social-media-automation',
  '*/30 * * * *', -- Every 30 minutes
  'SELECT public.run_social_media_automation();'
);

-- Log the cron setup
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🚀 Daily social media automation CRON job installed - Events at 9 AM, Restaurants at 6 PM Central', NOW());