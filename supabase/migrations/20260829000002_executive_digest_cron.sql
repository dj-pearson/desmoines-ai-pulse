-- AOS-MANAGE-001 AC2: deliver the executive digest on a schedule.
--
-- Daily at 13:05 UTC, just after the 12:00 event crawl, so the content numbers
-- describe the day that has actually been ingested rather than the one before.
--
-- WRITTEN AGAINST WEB-OPS-007's FINDINGS, NOT THE OLD PATTERN. 57 of 61 pg_cron
-- jobs in this project have never succeeded, for two causes that this migration
-- deliberately avoids repeating:
--
--   1. 48 die on `unrecognized configuration parameter "app.settings.supabase_url"`.
--      CORRECTED 2026-08-31 (SEO-023): passing missing_ok to current_setting was
--      not enough, because there is nothing to read. Supabase removed those GUCs
--      and refuses ALTER DATABASE/ROLE SET on them, so `true` only converts the
--      error into a silent NULL - and 'Bearer ' || NULL drops the Authorization
--      header entirely. Both reads now go through public.app_secret(), the Vault
--      reader 20260826000002 introduced and the mechanism every job currently
--      returning HTTP 200 uses. This migration had not been applied when the
--      correction was made (executive-digest-daily was absent from cron.job),
--      so nothing had to be re-run. scripts/check-cron-credentials.mjs is what
--      found it, and is what stops the next one.
--
--   2. 8 call net.http_post(url := ..., headers := ..., body := <text>), which
--      matches no installed signature - pg_net takes
--      (url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer).
--      Verified against pg_proc on this database before writing: this call uses
--      that signature, with body as jsonb.
--
-- WEB-OPS-007 AC3 is the reason for the RAISE rather than a silent skip:
-- current_setting('...', true) returns NULL when unset, 'Bearer ' || NULL is
-- NULL, and the Authorization header then vanishes - so the job would POST
-- unauthenticated, pg_cron would record SUCCESS, and the function would 401
-- into a void. A loud failure is strictly better than that, and it is why this
-- job will show as failing until the owner sets the credentials.
--
-- Idempotent and guarded so it is a no-op where pg_cron is absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping executive-digest schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'executive-digest-daily') THEN
    PERFORM cron.unschedule('executive-digest-daily');
  END IF;

  PERFORM cron.schedule(
    'executive-digest-daily',
    '5 13 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url  text := public.app_secret('supabase_url');
      v_key  text := public.app_secret('service_role_key');
    BEGIN
      -- Fail loudly and by name. Posting without the bearer would look like a
      -- success here and a 401 there, which is the failure WEB-OPS-007 AC3
      -- calls strictly worse than the current loud one.
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION
          'executive-digest not run: % not set at the database level',
          CASE
            WHEN v_url IS NULL AND v_key IS NULL THEN 'app.settings.supabase_url and app.settings.service_role_key'
            WHEN v_url IS NULL THEN 'app.settings.supabase_url'
            ELSE 'app.settings.service_role_key'
          END;
      END IF;

      PERFORM net.http_post(
        url     := v_url || '/functions/v1/executive-digest',
        body    := jsonb_build_object('windowDays', 1),
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
