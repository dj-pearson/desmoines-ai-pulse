-- Create cron job for social media automation
-- This will run twice daily at 9 AM and 6 PM Central Time (14:00 and 23:00 UTC)

-- First, unschedule any existing social media automation jobs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-automation-morning') THEN
    PERFORM cron.unschedule('social-media-automation-morning');
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-automation-evening') THEN
    PERFORM cron.unschedule('social-media-automation-evening');
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-automation-hourly') THEN
    PERFORM cron.unschedule('social-media-automation-hourly');
  END IF;
END $$;

-- Schedule social media automation to run every hour to check for posting times
-- The function itself handles the logic for when to actually post
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-automation-hourly') THEN
    PERFORM cron.schedule(
      'social-media-automation-hourly',
      '0 * * * *', -- Every hour at the top of the hour
      'SELECT public.run_social_media_automation();'
    );
  END IF;
END $$;

-- Verify the cron job was created (wrapped for safety)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'Social media cron jobs:';
    PERFORM jobname, schedule, active FROM cron.job WHERE jobname LIKE '%social-media%';
  END IF;
END $$;

-- Log the setup
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('📱 Social media automation cron job scheduled to run hourly', NOW());
  END IF;
END $$;