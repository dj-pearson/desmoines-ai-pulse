-- WEB-AUTO-019: schedule restaurant-verification-health nightly.
--
--   restaurant-verification-health  daily 11:07 UTC (05:07 Central), after
--   restaurant-hours-refresh (09:41) and restaurant-place-lookup (10:13)
--
-- Reads counts only (HEAD requests); no Places calls, no writes besides its
-- own automation_job_runs row. Threshold in system_settings
-- (setting_type 'restaurant_verification_health', settings.max_unverified_share,
-- default 0.25). Credentials from Vault via public.app_secret(), as
-- 20261121000010 does. Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping restaurant-verification-health schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restaurant-verification-health') THEN
    PERFORM cron.unschedule('restaurant-verification-health');
  END IF;

  PERFORM cron.schedule(
    'restaurant-verification-health',
    '7 11 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'restaurant-verification-health not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/restaurant-verification-health',
        body    := '{}'::jsonb,
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 60000
      );
    END
    $inner$;
    $cron$
  );
END
$$;
