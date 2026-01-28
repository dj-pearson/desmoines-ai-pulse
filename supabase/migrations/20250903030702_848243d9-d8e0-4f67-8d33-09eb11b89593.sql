-- Fix CRON system: Check existing jobs and create proper scheduling
-- Check existing cron jobs first
DO $$
BEGIN
  -- Try to unschedule existing jobs (ignore if they don't exist)
  BEGIN
    PERFORM cron.unschedule('social-media-generation');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error if job doesn't exist
  END;
  
  BEGIN
    PERFORM cron.unschedule('social-media-publishing');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error if job doesn't exist
  END;
  
  BEGIN
    PERFORM cron.unschedule('social-media-automation');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error if job doesn't exist
  END;
END $$;

-- Update the social media automation function to only do generation
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void AS $$
DECLARE
  social_media_response TEXT;
BEGIN
  -- Generate posts at scheduled times (9 AM for events, 6 PM for restaurants)
  BEGIN
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'action', 'automated_generation_only',
        'triggerSource', 'cron'
      )
    ) INTO social_media_response;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('📝 Social media post generation check completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, error_details, created_at) 
      VALUES ('❌ Social media post generation failed', SQLERRM, NOW());
    END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new function for webhook publishing
CREATE OR REPLACE FUNCTION public.run_social_media_publishing()
RETURNS void AS $$
DECLARE
  social_media_response TEXT;
BEGIN
  -- Publish pending posts to webhooks
  BEGIN
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'action', 'publish_pending_posts',
        'triggerSource', 'cron'
      )
    ) INTO social_media_response;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('📤 Social media webhook publishing completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, error_details, created_at) 
      VALUES ('❌ Social media webhook publishing failed', SQLERRM, NOW());
    END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule post generation at 9:00 AM and 6:00 PM Central Time (14:00 and 23:00 UTC)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-generation') THEN
      PERFORM cron.unschedule('social-media-generation');
    END IF;
    PERFORM cron.schedule(
      'social-media-generation',
      '0 14,23 * * *',
      'SELECT public.run_social_media_automation();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule webhook publishing 15 minutes after generation times
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-publishing') THEN
      PERFORM cron.unschedule('social-media-publishing');
    END IF;
    PERFORM cron.schedule(
      'social-media-publishing',
      '15 14,23 * * *',
      'SELECT public.run_social_media_publishing();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;