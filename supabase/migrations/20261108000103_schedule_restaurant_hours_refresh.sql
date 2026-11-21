-- WEB-FEAT-079 slice 2: schedule the stale-hours refresh.
--
-- Slice 1 (20261108000099 + bulk-update-restaurants) taught the function to
-- re-read hours_json and business_status for rows whose last check is older
-- than `staleDays`. Nothing called it, so a place that changed its hours or
-- closed still kept the answer from the day it was first filled, and every
-- open-now badge and closed-place filter reads those two columns.
--
--   restaurant-hours-refresh  daily 09:41 UTC (03:41 Central)
--                             bulk-update-restaurants
--                             {"hoursOnly": true, "staleDays": 30, "batchSize": 20}
--
-- COST, named because each row is a paid call. One Places Details request per
-- row with the two-field mask regularOpeningHours,businessStatus, which bills
-- at the Enterprise SKU because of regularOpeningHours. At most 20 a day, about
-- 600 a month. With roughly 480 rows holding hours, the first pass works
-- through the backlog in about 24 days (every row filled in 2026-09 is already
-- past 30 days), then settles near 16 a day: each row once per 30 days. A row
-- Places has no hours for, or 404s, still moves hours_checked_at, so it is not
-- re-read at the head of every batch. Raising batchSize raises the bill
-- linearly; the function clamps it to 50.
--
-- RATE LIMIT. The function allows 5 calls per 15 minutes per caller. Once a
-- day is far inside that; do not move this to a sub-3-minute cadence.
--
-- ORDER. Apply 20261108000099 and deploy bulk-update-restaurants before this.
-- Against the old function the body's staleDays is ignored and hoursOnly runs
-- the fill mode (hours_json IS NULL), which is harmless; against the new
-- function without the column the refresh query answers 42703, the run 500s,
-- and check-cron-http reports it. Neither path writes hours_json: null.
--
-- Credentials from Vault via public.app_secret(), as 20261020000006 does; the
-- function uses requireAdminOrApiKey, which accepts the service-role key.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping restaurant-hours-refresh schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restaurant-hours-refresh') THEN
    PERFORM cron.unschedule('restaurant-hours-refresh');
  END IF;

  PERFORM cron.schedule(
    'restaurant-hours-refresh',
    '41 9 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'restaurant-hours-refresh not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/bulk-update-restaurants',
        body    := jsonb_build_object('hoursOnly', true, 'staleDays', 30, 'batchSize', 20),
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
