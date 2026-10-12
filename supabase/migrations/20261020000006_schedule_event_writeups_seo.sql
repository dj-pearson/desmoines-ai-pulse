-- Schedule AI writeups and SEO for upcoming events.
--
-- On 2026-10-12 about 51 events arrived a day; of 555 upcoming, 432 had no SEO
-- fields and none had an ai_writeup, and 0 of the last 1,220 had been enhanced.
-- Nothing scheduled the work: the only callers were two Make scenarios, one of
-- which called a generate-writeup function that does not exist.
--
--   event-writeups  every 15 min         bulk-enhance-events, 10 upcoming events
--                                        without a writeup, soonest first
--   event-seo       every 15 min, +7     generate-seo-content for events, 10
--                                        upcoming, writeup-ready first
--
-- The 7-minute offset lets the SEO run pick up what the writeup run just wrote,
-- since the SEO prompt builds geo_summary and the FAQ from ai_writeup. About 40
-- events an hour per step, so the 555-event backlog drains in under a day with
-- no separate backfill. Both functions refuse past events.
--
-- Order: apply 20261020000005, deploy bulk-enhance-events and
-- generate-seo-content, then apply this. Before the deploy the old
-- generate-seo-content has no date filter and would spend on past events.
--
-- Also clears legacy seo_title = 'PROCESSING...' locks. The deployed function
-- no longer writes that string, so any row still holding it was orphaned by a
-- crash and has no SEO; null makes it eligible again.
--
-- Credentials from Vault via public.app_secret(), as 20261020000003 does; both
-- functions use requireAdminOrApiKey, which accepts the service-role key.
-- Idempotent; the schedule part is a no-op without pg_cron.
UPDATE public.events
   SET seo_title = NULL, seo_description = NULL
 WHERE seo_title = 'PROCESSING...';

UPDATE public.restaurants
   SET seo_title = NULL, seo_description = NULL
 WHERE seo_title = 'PROCESSING...';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping event-writeups / event-seo schedules';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-writeups') THEN
    PERFORM cron.unschedule('event-writeups');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-seo') THEN
    PERFORM cron.unschedule('event-seo');
  END IF;

  PERFORM cron.schedule(
    'event-writeups',
    '*/15 * * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'event-writeups not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/bulk-enhance-events',
        body    := jsonb_build_object('batchSize', 10, 'triggerSource', 'cron'),
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 150000
      );
    END
    $inner$;
    $cron$
  );

  PERFORM cron.schedule(
    'event-seo',
    '7-59/15 * * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'event-seo not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/generate-seo-content',
        body    := jsonb_build_object('contentType', 'event', 'batchSize', 10),
        headers := jsonb_build_object(
                     'Authorization', 'Bearer ' || v_key,
                     'Content-Type', 'application/json',
                     'x-trigger-source', 'cron'
                   ),
        timeout_milliseconds := 150000
      );
    END
    $inner$;
    $cron$
  );
END
$$;
