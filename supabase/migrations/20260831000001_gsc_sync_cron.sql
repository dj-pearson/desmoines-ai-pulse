-- SEO-023: put Google Search Console on a schedule.
--
-- gsc-sync-data has run exactly once, by hand, on 2026-03-31. Probed on
-- 2026-08-31 before writing this: gsc_keyword_performance held 1,630 rows and
-- gsc_page_performance 2,060, every one of them dated 2026-02-28 to 2026-03-28.
-- So the tables were never empty - the anon key sees [] because the RLS policy
-- on all four gsc_* tables is `FOR ALL USING (is_admin())`, and anon is not an
-- admin. Emptiness and invisibility look identical through the anon key.
--
-- CREDENTIALS COME FROM VAULT, NOT FROM app.settings.*. 20260826000002 records
-- why: the platform refuses ALTER DATABASE/ROLE SET on those GUCs, so
-- current_setting('app.settings.service_role_key') is not merely unset, it is
-- unsettable, and 48 jobs failed on it every run since they were created.
-- Confirmed still true on 2026-08-31 - both GUCs read NULL - so any job written
-- against them would join the pile. public.app_secret() is the mechanism that
-- actually works here, and the jobs currently returning HTTP 200 all use it.
--
-- The command below was not written and hoped for. It was executed against
-- production as-is via net.http_post before being committed, and the edge
-- function answered 200 with
--   {"success":true,"summary":{"keywordsSynced":1000,"pagesSynced":2488,
--    "dateRange":{"start":"2026-07-31","end":"2026-08-28","days":28}}}
-- which is what makes the service-role bearer, the URL and the body shape
-- verified rather than assumed.
--
-- Idempotent, and a no-op where pg_cron is absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping gsc-sync schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gsc-sync-daily') THEN
    PERFORM cron.unschedule('gsc-sync-daily');
  END IF;

  -- 10:15 UTC, an otherwise empty slot. The hour barely matters: Search Console
  -- lags three days, so the newest row any run can fetch is dated t-3 whenever
  -- it fires.
  PERFORM cron.schedule(
    'gsc-sync-daily',
    '15 10 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
      p     record;
    BEGIN
      -- Fail loudly and by name. 'Bearer ' || NULL is NULL, the Authorization
      -- header then vanishes, pg_cron records SUCCESS because the POST was
      -- enqueued, and the function 401s where nobody is looking. A raised
      -- exception is the only version of this that anyone finds.
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION
          'gsc-sync-daily not run: vault secret % is missing',
          CASE
            WHEN v_url IS NULL AND v_key IS NULL THEN 'supabase_url and service_role_key'
            WHEN v_url IS NULL THEN 'supabase_url'
            ELSE 'service_role_key'
          END;
      END IF;

      FOR p IN
        SELECT id, COALESCE(default_date_range_days, 28) AS days
        FROM public.gsc_properties
        WHERE sync_enabled IS TRUE
          -- Not `status <> 'error'`: the function sets status='error' on a bad
          -- run, so filtering on it would make one failure permanent. A stuck
          -- is_syncing flag (function died mid-run) self-heals after an hour
          -- instead of blocking the property forever.
          AND (is_syncing IS NOT TRUE OR updated_at < now() - interval '1 hour')
      LOOP
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/gsc-sync-data',
          body    := jsonb_build_object('propertyId', p.id, 'dateRange', p.days),
          headers := jsonb_build_object(
                       'Authorization', 'Bearer ' || v_key,
                       'Content-Type', 'application/json',
                       'x-trigger-source', 'cron'
                     ),
          timeout_milliseconds := 120000
        );

        -- The admin panel reads next_sync_at to say when the data will move
        -- again. Left NULL it renders as "never", which is what it has said
        -- for five months and was true.
        UPDATE public.gsc_properties
        SET next_sync_at = now() + interval '1 day'
        WHERE id = p.id;
      END LOOP;
    END
    $inner$;
    $cron$
  );
END
$$;
