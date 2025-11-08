-- Schedule automatic restaurant data enrichment
-- This cron job runs daily at 3 AM to maintain high data quality
-- Note: pg_cron extension is pre-installed in Supabase and managed at platform level

-- First, unschedule any existing job with the same name
SELECT cron.unschedule('auto-enrich-restaurants-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-enrich-restaurants-daily'
);

-- Schedule auto-enrich-restaurants to run daily at 3 AM
-- Using Supabase environment variables via SQL
SELECT cron.schedule(
  'auto-enrich-restaurants-daily',
  '0 3 * * *',  -- Every day at 3:00 AM
  $$
  SELECT
    net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/auto-enrich-restaurants',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'batchSize', 20,
        'prioritizeNew', true
      )::text
    ) as request_id;
  $$
);

-- Log the scheduled job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "auto-enrich-restaurants-daily" scheduled to run daily at 3:00 AM';
  RAISE NOTICE 'This job automatically enriches restaurants with missing data (phone, website, rating, images, etc.)';
  RAISE NOTICE 'Note: pg_cron extension is managed by Supabase platform';
END $$;
