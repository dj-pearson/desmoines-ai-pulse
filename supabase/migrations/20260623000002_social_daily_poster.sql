-- WEB-AUTO-012: Daily social media auto-posting orchestrator
-- Seeds the admin-editable pause config, replaces the legacy hourly "decide by
-- Central hour" random generator with a single observable daily orchestrator
-- (social-daily-poster), and keeps the existing publishing safety-net cron.

-- ---------------------------------------------------------------------------
-- 1. Admin-editable config (system_settings). Default: enabled, nothing paused.
-- ---------------------------------------------------------------------------
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'social_daily_poster',
       '{"enabled": true, "pause_events": false, "pause_restaurants": false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'social_daily_poster'
);

-- ---------------------------------------------------------------------------
-- 2. Cron: retire the legacy random generator, schedule the orchestrator.
--    The legacy 'social-media-publishing' cron is left in place as a safety net
--    that publishes any lingering draft posts; the orchestrator publishes
--    directly (generate_and_publish) so it does not depend on it.
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
    ELSE
      RAISE NOTICE 'pg_cron unavailable; skipping social-daily-poster schedule';
      RETURN;
    END IF;
  END IF;

  -- Retire the legacy random hourly generator (replaced by the orchestrator).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-media-generation') THEN
    PERFORM cron.unschedule('social-media-generation');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-daily-poster-daily') THEN
    PERFORM cron.unschedule('social-daily-poster-daily');
  END IF;

  -- 14:00 UTC ≈ 9:00 AM Central. One run/day posts an event + a restaurant.
  PERFORM cron.schedule(
    'social-daily-poster-daily',
    '0 14 * * *',
    $$
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-daily-poster',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('source', 'cron')::text
    ) as request_id;
    $$
  );

  RAISE NOTICE 'Cron job "social-daily-poster-daily" scheduled (14:00 UTC daily)';
END
$cron$;
