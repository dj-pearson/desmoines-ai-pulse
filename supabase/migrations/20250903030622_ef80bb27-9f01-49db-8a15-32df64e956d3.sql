-- Fix CRON system: separate post generation from webhook publishing

-- First, check what cron jobs exist
SELECT 
  jobname,
  schedule,
  command,
  active
FROM cron.job 
ORDER BY jobname;

-- Update the social media automation function to separate generation from publishing
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
    
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📝 Social media post generation check completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_logs (message, error_details, created_at) 
    VALUES ('❌ Social media post generation failed', SQLERRM, NOW());
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
    
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📤 Social media webhook publishing completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_logs (message, error_details, created_at) 
    VALUES ('❌ Social media webhook publishing failed', SQLERRM, NOW());
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove existing cron jobs
SELECT cron.unschedule('social-media-automation');
SELECT cron.unschedule('social-media-generation');
SELECT cron.unschedule('social-media-publishing');

-- Schedule post generation at 9:00 AM and 6:00 PM Central Time (14:00 and 23:00 UTC)
SELECT cron.schedule(
  'social-media-generation',
  '0 14,23 * * *',  -- 9 AM and 6 PM Central Time
  'SELECT public.run_social_media_automation();'
);

-- Schedule webhook publishing 15 minutes after generation times
SELECT cron.schedule(
  'social-media-publishing',
  '15 14,23 * * *',  -- 9:15 AM and 6:15 PM Central Time
  'SELECT public.run_social_media_publishing();'
);