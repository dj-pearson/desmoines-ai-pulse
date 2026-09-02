-- WEB-SEC-032: a service_role JWT was written here as a literal in 2025. It is
-- replaced with the Vault read the rest of the codebase uses. This file is
-- APPLIED HISTORY and is never re-run, so editing it changes no database --
-- what it does is stop the tree carrying a live credential. The key that was
-- installed by this migration is removed from the DATABASE by
-- 20260902000015_purge_embedded_service_key.sql, and rotating it is a
-- separate, owner-only action (docs/SECRETS_ROTATION.md).
-- Fix Social Media CRON Schedule to run every hour and let function handle timing
-- Drop existing social media cron jobs (wrapped for safety)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-generation') THEN
      PERFORM cron.unschedule('social-media-generation');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-publishing') THEN
      PERFORM cron.unschedule('social-media-publishing');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-social-media-automation') THEN
      PERFORM cron.unschedule('daily-social-media-automation');
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if cron operations fail
END $$;

-- Create new optimized schedule
-- Generation check: every hour, function will decide based on Central Time
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    PERFORM cron.schedule(
      'social-media-generation',
      '0 * * * *', -- Every hour at minute 0
      'SELECT public.run_social_media_automation();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if cron operations fail
END $$;

-- Publishing check: 15 minutes after generation
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    PERFORM cron.schedule(
      'social-media-publishing',
      '15 * * * *', -- Every hour at minute 15
      'SELECT public.run_social_media_publishing();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if cron operations fail
END $$;

-- Also create a function to check if service role key is available
CREATE OR REPLACE FUNCTION public.run_social_media_publishing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  social_media_response TEXT;
  service_key TEXT;
BEGIN
  -- Get service role key from vault
  BEGIN
    SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY') INTO service_key;
  EXCEPTION WHEN OTHERS THEN
    service_key := public.app_secret('service_role_key');
  END;

  -- Publish pending posts to webhooks
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
$$;

-- Update the automation function to use fallback service key
CREATE OR REPLACE FUNCTION public.run_social_media_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  social_media_response TEXT;
  service_key TEXT;
BEGIN
  -- Get service role key from vault or use fallback
  BEGIN
    SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY') INTO service_key;
  EXCEPTION WHEN OTHERS THEN
    service_key := public.app_secret('service_role_key');
  END;

  -- Generate posts at scheduled times (9 AM for events, 6 PM for restaurants)
  BEGIN
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
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
$$;

-- Test the fixed system
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔧 Fixed social media CRON schedule - now runs every hour with proper fallback service key', NOW());
  END IF;
END $$;