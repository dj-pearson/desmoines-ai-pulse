-- WEB-PERF-007: schedule the weekly web-vitals rollup (Mondays 06:00 UTC).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('web-vitals-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'web-vitals-weekly');

    PERFORM cron.schedule(
      'web-vitals-weekly',
      '0 6 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/web-vitals-weekly',
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
