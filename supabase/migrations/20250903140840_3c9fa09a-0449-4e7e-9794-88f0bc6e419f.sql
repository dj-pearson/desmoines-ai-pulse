-- Fix CRON social media automation to actually work properly
-- The issue is that the database functions are calling HTTP endpoints but the edge function
-- timezone logic is still not working correctly

-- Update the database function to use a simpler direct approach
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_central_hour INTEGER;
  events_generated INTEGER := 0;
  restaurants_generated INTEGER := 0;
  social_media_response TEXT;
  service_key TEXT;
BEGIN
  -- Get current Central Time hour using reliable method
  SELECT EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Chicago'))::INTEGER INTO current_central_hour;
  
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🕐 Social media automation check - Central Time hour: ' || current_central_hour, NOW());
  
  -- Get service role key from vault or use fallback
  BEGIN
    SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY') INTO service_key;
  EXCEPTION WHEN OTHERS THEN
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM';
  END;

  -- Generate event posts at 9 AM Central Time
  IF current_central_hour = 9 THEN
    -- Check if we already generated an event post today (Central Time)
    SELECT COUNT(*) INTO events_generated
    FROM public.social_media_posts 
    WHERE content_type = 'event'
      AND subject_type = 'event_of_the_day'
      AND DATE(created_at AT TIME ZONE 'America/Chicago') = CURRENT_DATE
      AND status IN ('draft', 'posted');
    
    IF events_generated = 0 THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🎉 Generating event post for today (9 AM Central)', NOW());
      
      BEGIN
        SELECT net.http_post(
          url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'action', 'generate',
            'contentType', 'event',
            'subjectType', 'event_of_the_day',
            'triggerSource', 'cron',
            'forceGenerate', true
          )
        ) INTO social_media_response;
        
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✅ Event post generation triggered: ' || COALESCE(social_media_response, 'no response'), NOW());
        
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Event post generation failed', SQLERRM, NOW());
      END;
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏩ Event already generated today (' || events_generated || ' posts found)', NOW());
    END IF;
  END IF;
  
  -- Generate restaurant posts at 6 PM Central Time (18:00)
  IF current_central_hour = 18 THEN
    -- Check if we already generated a restaurant post today (Central Time)
    SELECT COUNT(*) INTO restaurants_generated
    FROM public.social_media_posts 
    WHERE content_type = 'restaurant'
      AND subject_type = 'restaurant_of_the_day'
      AND DATE(created_at AT TIME ZONE 'America/Chicago') = CURRENT_DATE
      AND status IN ('draft', 'posted');
    
    IF restaurants_generated = 0 THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🍽️ Generating restaurant post for today (6 PM Central)', NOW());
      
      BEGIN
        SELECT net.http_post(
          url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'action', 'generate',
            'contentType', 'restaurant',
            'subjectType', 'restaurant_of_the_day',
            'triggerSource', 'cron',
            'forceGenerate', true
          )
        ) INTO social_media_response;
        
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✅ Restaurant post generation triggered: ' || COALESCE(social_media_response, 'no response'), NOW());
        
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Restaurant post generation failed', SQLERRM, NOW());
      END;
    ELSE
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('⏩ Restaurant already generated today (' || restaurants_generated || ' posts found)', NOW());
    END IF;
  END IF;
  
  -- Log when it's not the right time
  IF current_central_hour != 9 AND current_central_hour != 18 THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('⏰ Not the right time for posting (hour: ' || current_central_hour || ', need 9 or 18)', NOW());
  END IF;
END;
$$;

-- Update the publishing function to handle posts generated in draft status
CREATE OR REPLACE FUNCTION public.run_social_media_publishing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_posts_count INTEGER;
  social_media_response TEXT;
  service_key TEXT;
BEGIN
  -- Get service role key from vault or use fallback
  BEGIN
    SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY') INTO service_key;
  EXCEPTION WHEN OTHERS THEN
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM';
  END;

  -- Check for pending posts (created today, status = draft)
  SELECT COUNT(*) INTO pending_posts_count
  FROM public.social_media_posts 
  WHERE status = 'draft'
    AND DATE(created_at AT TIME ZONE 'America/Chicago') = CURRENT_DATE;
  
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('📤 Publishing check: found ' || pending_posts_count || ' pending posts to publish', NOW());
  
  IF pending_posts_count > 0 THEN
    BEGIN
      SELECT net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'action', 'publish_pending_posts',
          'triggerSource', 'cron'
        )
      ) INTO social_media_response;
      
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('✅ Post publishing triggered: ' || COALESCE(social_media_response, 'no response'), NOW());
      
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_logs (message, error_details, created_at) 
      VALUES ('❌ Post publishing failed', SQLERRM, NOW());
    END;
  END IF;
END;
$$;

-- Test the system right now
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔧 Updated CRON social media functions with proper Central Time logic and direct generation calls', NOW());