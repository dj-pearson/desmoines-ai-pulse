-- WEB-AUTO-012: Daily social media auto-posting (event + restaurant of the day).
--
-- social-media-manager already had all the generation + webhook-publish
-- machinery, but the LIVE automation was a pair of hourly pg_cron jobs
-- (`social-media-generation` / `social-media-publishing`, migration
-- 20250903031613) that only drafted at 9am/6pm Central and published drafts
-- separately, with ZERO observability (no automation_job_runs row, no
-- watchdog), RANDOM content selection, a 7-day no-repeat window, and no pause
-- switch. This migration retires those legacy crons and routes the daily post
-- through the new observable, jobRunner-wrapped `daily_auto_post` action with a
-- 30-day no-repeat window, highest-signal selection, and a per-platform pause
-- flag.
--
-- Additive + idempotent only (no drops): the legacy SQL helper functions
-- run_social_media_automation / run_social_media_publishing are LEFT defined
-- (additive) — only their schedules are removed.

-- 1. Pause flag (admin-toggleable; service_role bypasses RLS so the edge fn
--    reads it freely). settings = { paused: bool, paused_platforms: text[] }.
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'social_auto_post', jsonb_build_object('paused', false, 'paused_platforms', '[]'::jsonb)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'social_auto_post'
);

-- 2. Retire the legacy hourly social crons so the new daily cron is the single
--    live path (no double-posting). All guarded — unschedule only if present.
DO $$
DECLARE
  legacy TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH legacy IN ARRAY ARRAY[
      'social-media-generation',
      'social-media-publishing',
      'social-media-automation',
      'social-media-automation-morning',
      'social-media-automation-evening',
      'social-media-automation-hourly',
      'daily-social-media-automation'
    ] LOOP
      PERFORM cron.unschedule(legacy)
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = legacy);
    END LOOP;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- never block the migration on cron maintenance
END $$;

-- 3. New daily cron: 14:00 UTC ≈ 9am Central. One run posts the highest-signal
--    upcoming event AND a featured restaurant. Routes through the WEB-AUTO-001
--    jobRunner (Job Health panel + failure alerts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('social-auto-post-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-auto-post-daily');

    PERFORM cron.schedule(
      'social-auto-post-daily',
      '0 14 * * *',  -- 14:00 UTC daily (~9am Central)
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/social-media-manager',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('action', 'daily_auto_post', 'triggerSource', 'cron')
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
