-- WEB-AUTO-008: Schedule the weekly-digest assembler.
--
-- Runs Tuesdays at 14:00 UTC (9:00 AM Central in CDT; 8:00 AM in CST). The
-- assembler builds the campaign and inserts it with status='scheduled' /
-- scheduled_for=now(), so the existing dispatch-scheduled-newsletters cron
-- (every minute) sends it within ~1 minute through the identical Resend path
-- (so unsubscribe/compliance + delivery webhooks behave exactly as for a
-- manual send).
--
-- pg_cron pattern matches 20260520000012_schedule_newsletter_dispatch.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: drop any prior schedule before re-creating.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assemble-weekly-digest') THEN
      PERFORM cron.unschedule('assemble-weekly-digest');
    END IF;

    PERFORM cron.schedule(
      'assemble-weekly-digest',
      '0 14 * * 2',  -- Tuesday 14:00 UTC
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/assemble-weekly-digest',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('action', 'assemble')
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;
