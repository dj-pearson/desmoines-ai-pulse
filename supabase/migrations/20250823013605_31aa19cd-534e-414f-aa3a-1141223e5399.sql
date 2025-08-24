-- Create cron job for social media automation
-- This will run every hour and the function handles when to actually post

-- Schedule social media automation to run every hour to check for posting times
-- The function itself handles the logic for when to actually post (9 AM and 6 PM Central)
SELECT cron.schedule(
  'social-media-automation-hourly',
  '0 * * * *', -- Every hour at the top of the hour
  $$
  SELECT public.run_social_media_automation();
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%social-media%';

-- Log the setup
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('📱 Social media automation cron job scheduled to run hourly', NOW());