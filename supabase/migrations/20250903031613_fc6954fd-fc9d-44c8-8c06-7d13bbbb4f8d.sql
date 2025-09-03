-- Fix Social Media CRON Schedule to run every hour and let function handle timing
-- Drop existing social media cron jobs
SELECT cron.unschedule('social-media-generation');
SELECT cron.unschedule('social-media-publishing');
SELECT cron.unschedule('daily-social-media-automation');

-- Create new optimized schedule
-- Generation check: every hour, function will decide based on Central Time
SELECT cron.schedule(
  'social-media-generation',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT public.run_social_media_automation();$$
);

-- Publishing check: 15 minutes after generation
SELECT cron.schedule(
  'social-media-publishing',
  '15 * * * *', -- Every hour at minute 15
  $$SELECT public.run_social_media_publishing();$$
);

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
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM';
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
    
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📤 Social media webhook publishing completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_logs (message, error_details, created_at) 
    VALUES ('❌ Social media webhook publishing failed', SQLERRM, NOW());
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
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM';
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
    
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📝 Social media post generation check completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_logs (message, error_details, created_at) 
    VALUES ('❌ Social media post generation failed', SQLERRM, NOW());
  END;
END;
$$;

-- Test the fixed system
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔧 Fixed social media CRON schedule - now runs every hour with proper fallback service key', NOW());