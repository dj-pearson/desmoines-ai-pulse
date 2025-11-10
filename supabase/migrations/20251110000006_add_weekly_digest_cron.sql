-- Schedule weekly digest cron job
-- Runs every Sunday at 8 AM Central Time (14:00 UTC)
-- Note: pg_cron extension is already enabled in Supabase by default

-- First, unschedule any existing weekly digest job to avoid duplicates
SELECT cron.unschedule('send-weekly-digest') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-digest'
);

-- Schedule the weekly digest job
-- Cron format: minute hour day-of-month month day-of-week
-- '0 14 * * 0' = Every Sunday at 14:00 UTC (8:00 AM Central Time)
SELECT cron.schedule(
  'send-weekly-digest',
  '0 14 * * 0',
  $$
  SELECT
    net.http_post(
      url := 'https://vhlvvbexepfbzolsiwrz.supabase.co/functions/v1/send-weekly-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'triggered_by', 'cron',
        'timestamp', now()
      ),
      timeout_milliseconds := 300000
    ) AS request_id;
  $$
);

-- Log the cron job creation
DO $$
BEGIN
  RAISE NOTICE 'Weekly digest cron job scheduled: Every Sunday at 8:00 AM Central Time (14:00 UTC)';
END $$;
