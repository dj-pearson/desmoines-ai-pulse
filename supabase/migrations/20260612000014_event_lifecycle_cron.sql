-- WEB-AUTO-006: schedule the two-phase lifecycle cleanup; retire the legacy
-- single-phase SQL cron so we don't hard-delete without the soft-hide phase.
--
-- The legacy job 'cleanup-old-events-weekly' (migration 20250107000005) called
-- the SQL cleanup_old_events() directly: it deleted events 90 days past with a
-- full-row archive that now fails on the wider events schema. We unschedule it
-- and run the edge function cleanup-old-events nightly instead, which does
-- soft-hide (30d) -> archive + hard-delete (180d) through the WEB-AUTO-001
-- jobRunner. The legacy function + archived_events table are left in place.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Retire the legacy single-phase cron if present.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-events-weekly') THEN
      PERFORM cron.unschedule('cleanup-old-events-weekly');
    END IF;

    -- Re-create the lifecycle cron (idempotent).
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-lifecycle-cleanup') THEN
      PERFORM cron.unschedule('event-lifecycle-cleanup');
    END IF;

    PERFORM cron.schedule(
      'event-lifecycle-cleanup',
      '15 4 * * *', -- nightly 04:15 UTC
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/cleanup-old-events',
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
