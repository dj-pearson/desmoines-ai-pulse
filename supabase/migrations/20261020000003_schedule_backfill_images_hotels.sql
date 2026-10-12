-- Schedule backfill-images for hotels.
--
-- This is what makes the 30-day rule hold for hotel photos. backfill-images'
-- "hotels" category copies a Places photo into Storage, replaces any copy older
-- than 20 days, and deletes any copy older than 29 days it could not replace.
-- Those last two only happen when the job runs, so the schedule is part of the
-- compliance, not a convenience: if this job stops, the copies outlive their
-- window. Every 6 hours, matching restaurants and attractions; the 29-day
-- deletion leaves a day of slack for missed runs.
--
-- Separate from 20261020000002 on purpose. Apply the columns, deploy
-- backfill-images, then apply this. Applied before the deploy, each run gets a
-- 400 for an unknown category and changes nothing.
--
-- Credentials from Vault via public.app_secret(), as 20261003000007 does.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping backfill-images-hotels schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-images-hotels') THEN
    PERFORM cron.unschedule('backfill-images-hotels');
  END IF;

  PERFORM cron.schedule(
    'backfill-images-hotels',
    '53 */6 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'backfill-images-hotels not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/backfill-images',
        body    := jsonb_build_object('category', 'hotels', 'batchSize', 25),
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 30000
      );
    END
    $inner$;
    $cron$
  );
END
$$;
