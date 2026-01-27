-- Schedule automatic restaurant data enrichment
-- This cron job runs daily at 3 AM to maintain high data quality
-- Guard against environments where pg_cron is unavailable (e.g., shadow DB during db pull)

DO $cron$
BEGIN
  -- Ensure pg_cron exists; skip scheduling if the extension is unavailable in this environment
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
    ELSE
      RAISE NOTICE 'pg_cron extension not available; skipping cron job setup for auto-enrich-restaurants-daily';
      RETURN;
    END IF;
  END IF;

  -- Remove any prior scheduled job with the same name
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-enrich-restaurants-daily') THEN
    PERFORM cron.unschedule('auto-enrich-restaurants-daily');
  END IF;

  -- Schedule auto-enrich-restaurants to run daily at 3 AM using service role key
  PERFORM cron.schedule(
    'auto-enrich-restaurants-daily',
    '0 3 * * *',
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

  RAISE NOTICE 'Cron job "auto-enrich-restaurants-daily" scheduled to run daily at 3:00 AM';
  RAISE NOTICE 'This job automatically enriches restaurants with missing data (phone, website, rating, images, etc.)';
  RAISE NOTICE 'Note: pg_cron extension is managed by Supabase platform';
END
$cron$;
