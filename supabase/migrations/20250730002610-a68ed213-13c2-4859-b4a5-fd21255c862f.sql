-- Create social media automation CRON job
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void AS $$
DECLARE
  optimal_time TIMESTAMPTZ;
  last_event_post TIMESTAMPTZ;
  last_restaurant_post TIMESTAMPTZ;
  should_post_event BOOLEAN := false;
  should_post_restaurant BOOLEAN := false;
BEGIN
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting social media automation check', NOW());
  
  -- Get optimal posting time
  optimal_time := public.get_next_optimal_posting_time();
  
  -- Check if we're in optimal posting hours
  IF optimal_time <= NOW() + INTERVAL '1 hour' THEN
    -- Check last event post
    SELECT MAX(created_at) INTO last_event_post
    FROM public.social_media_posts
    WHERE content_type = 'event' AND status IN ('posted', 'scheduled');
    
    -- Check last restaurant post
    SELECT MAX(created_at) INTO last_restaurant_post
    FROM public.social_media_posts
    WHERE content_type = 'restaurant' AND status IN ('posted', 'scheduled');
    
    -- Determine if we should post (every 24 hours for each type)
    should_post_event := (last_event_post IS NULL OR last_event_post < NOW() - INTERVAL '24 hours');
    should_post_restaurant := (last_restaurant_post IS NULL OR last_restaurant_post < NOW() - INTERVAL '24 hours');
    
    -- Alternate between event and restaurant posts
    IF should_post_event AND should_post_restaurant THEN
      -- Post event on even days, restaurant on odd days
      IF EXTRACT(DAY FROM NOW())::INTEGER % 2 = 0 THEN
        should_post_restaurant := false;
      ELSE
        should_post_event := false;
      END IF;
    END IF;
    
    -- Generate and schedule posts
    IF should_post_event THEN
      -- Call social media manager to generate event post
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('Triggering event post generation', NOW());
      
      -- This would trigger the edge function but we'll handle it manually for now
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
      
    ELSIF should_post_restaurant THEN
      -- Call social media manager to generate restaurant post
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('Triggering restaurant post generation', NOW());
      
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
    END IF;
  ELSE
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('Outside optimal posting hours, skipping social media automation', NOW());
  END IF;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Schedule social media automation to run every 2 hours
SELECT cron.schedule(
  'social-media-automation',
  '0 */2 * * *', -- Every 2 hours
  'SELECT public.run_social_media_automation();'
);