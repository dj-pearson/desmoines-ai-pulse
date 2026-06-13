-- WEB-AUTO-007: schedule the daily AI article pipeline (11:00 UTC ~ 5/6am Central).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ai-article-pipeline-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-article-pipeline-daily');

    PERFORM cron.schedule(
      'ai-article-pipeline-daily',
      '0 11 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/ai-article-pipeline',
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
