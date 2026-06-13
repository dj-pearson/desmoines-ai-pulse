-- WEB-AUTO-005: schedule the weekly duplicate-detection + merge job.
-- Monday 03:15 UTC (low-traffic window; after the nightly data-quality heal).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dedupe-content-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dedupe-content-weekly');

    PERFORM cron.schedule(
      'dedupe-content-weekly',
      '15 3 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/dedupe-content',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        )
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
