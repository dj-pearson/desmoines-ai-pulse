-- Schedule automatic restaurant data enrichment
-- This cron job runs daily at 3 AM to maintain high data quality

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule auto-enrich-restaurants to run daily at 3 AM
SELECT cron.schedule(
  'auto-enrich-restaurants-daily',
  '0 3 * * *',  -- Every day at 3:00 AM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-enrich-restaurants',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'batchSize', 20,
        'prioritizeNew', true
      )
    ) as request_id;
  $$
);

-- Add comment for documentation
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used to schedule automatic data enrichment and cleanup tasks';

-- Log the scheduled job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "auto-enrich-restaurants-daily" scheduled to run daily at 3:00 AM';
  RAISE NOTICE 'This job automatically enriches restaurants with missing data (phone, website, rating, images, etc.)';
END $$;
