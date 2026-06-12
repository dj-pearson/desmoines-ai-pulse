-- WEB-AUTO-003: schedule the nightly data-quality self-healing pipeline (02:30 UTC).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('data-quality-heal-nightly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'data-quality-heal-nightly');

    PERFORM cron.schedule(
      'data-quality-heal-nightly',
      '30 2 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/data-quality-heal',
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
