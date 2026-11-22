-- WEB-BE-071: re-scrape stale restaurant menus without an admin click.
--
-- Additive only: one new cron job. No table, column or function changes.
--
-- scrape-restaurant-menus already re-scraped menus older than 30 days, but
-- nothing scheduled it, so the rule ran only when someone pressed the button
-- in the admin menu panel. This posts { "scheduled": true }, which the
-- function runs inside runJob('menu-refresh-weekly'), so every slice lands in
-- automation_job_runs and Admin > Job Health.
--
-- SCHEDULE. Hourly on Tuesdays (UTC), 24 slices. One request gets through one
-- or two restaurants before Supabase's 150s idle limit (a restaurant may take
-- up to 100s), so a single weekly request would refresh almost nothing.
--
-- COST. At most 25 restaurants are attempted per week (owner decision
-- 2026-11-21), counted across the slices from automation_job_runs
-- items_processed over the last 6 days; once spent, the remaining slices
-- record a run with nothing attempted. Each attempt is up to 6 Claude calls
-- (DEFAULT_BUDGET.llmCalls) and 18 page fetches; a menu found in schema.org
-- data or a platform's embedded JSON costs no Claude call. A restaurant that
-- fails is not retried until the 6-day window passes.
--
-- A failed or empty scrape publishes nothing: the previous menu stays current
-- and the failure is written to menu_scrape_attempts.
--
-- ORDER. Deploy the new scrape-restaurant-menus BEFORE applying this. An older
-- deploy ignores "scheduled" and runs the admin button's default selection
-- (up to 10 restaurants past the 30-day rule) in every slice, with no weekly
-- cap and no automation_job_runs row.
--
-- Credentials from Vault via public.app_secret(), as 20261121000010 does.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping menu-refresh-weekly';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'menu-refresh-weekly') THEN
    PERFORM cron.unschedule('menu-refresh-weekly');
  END IF;

  PERFORM cron.schedule(
    'menu-refresh-weekly',
    '19 * * * 2',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'menu-refresh-weekly not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/scrape-restaurant-menus',
        body    := jsonb_build_object('scheduled', true),
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
