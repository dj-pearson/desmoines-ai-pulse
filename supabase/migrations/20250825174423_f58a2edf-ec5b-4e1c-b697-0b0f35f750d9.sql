-- Fix social media automation to have more flexible posting windows and better debugging

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
BEGIN
  -- Get current Central Time
  central_time := NOW() AT TIME ZONE 'America/Chicago';
  current_hour := EXTRACT(HOUR FROM central_time)::INTEGER;
  current_minute := EXTRACT(MINUTE FROM central_time)::INTEGER;
  
  -- Log the cron job execution with current time info
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🤖 Social Media Automation Check - Central Time: ' || central_time || ' (Hour: ' || current_hour || ', Minute: ' || current_minute || ')', NOW());
  
  -- Check for event posting (9-10 AM Central Time window)
  IF current_hour = 9 OR (current_hour = 10 AND current_minute < 30) THEN
    -- Check last event post
    SELECT MAX(created_at) INTO last_event_post
    FROM public.social_media_posts
    WHERE content_type = 'event' AND status IN ('posted', 'scheduled');
    
    -- Post event if none posted in last 18 hours (to avoid double posting but allow retries)
    should_post_event := (last_event_post IS NULL OR last_event_post < NOW() - INTERVAL '18 hours');
    
    IF should_post_event THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🌅 Triggering morning event post generation (Hour: ' || current_hour || ')', NOW());
      
      -- Call social media manager to generate event post
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
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping event post - already posted recently (last post: ' || COALESCE(last_event_post::text, 'never') || ')', NOW());
    END IF;
  END IF;
  
  -- Check for restaurant posting (6-7 PM Central Time window)
  IF current_hour = 18 OR (current_hour = 19 AND current_minute < 30) THEN
    -- Check last restaurant post
    SELECT MAX(created_at) INTO last_restaurant_post
    FROM public.social_media_posts
    WHERE content_type = 'restaurant' AND status IN ('posted', 'scheduled');
    
    -- Post restaurant if none posted in last 18 hours (to avoid double posting but allow retries)
    should_post_restaurant := (last_restaurant_post IS NULL OR last_restaurant_post < NOW() - INTERVAL '18 hours');
    
    IF should_post_restaurant THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🍽️ Triggering evening restaurant post generation (Hour: ' || current_hour || ')', NOW());
      
      -- Call social media manager to generate restaurant post
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
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏭️ Skipping restaurant post - already posted recently (last post: ' || COALESCE(last_restaurant_post::text, 'never') || ')', NOW());
    END IF;
  END IF;
  
  -- Log completion if no actions taken
  IF (current_hour NOT IN (9, 10, 18, 19)) OR 
     (current_hour = 10 AND current_minute >= 30) OR 
     (current_hour = 19 AND current_minute >= 30) THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🕐 Social media automation check completed - outside posting windows (9-10:30 AM or 6-7:30 PM Central)', NOW());
  END IF;
  
END;
$function$;