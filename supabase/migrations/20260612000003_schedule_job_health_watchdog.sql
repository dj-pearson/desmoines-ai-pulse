-- WEB-AUTO-001: schedule the job-health watchdog (daily 08:00 UTC).
-- It alerts the admin when an observed job has missed ~2 expected runs or its
-- latest run failed. Authenticates with the service-role key (accepted by
-- _shared/apiKeyAuth.ts requireAdminOrApiKey).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('job-health-watchdog-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-health-watchdog-daily');

    PERFORM cron.schedule(
      'job-health-watchdog-daily',
      '0 8 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/job-health-watchdog',
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
