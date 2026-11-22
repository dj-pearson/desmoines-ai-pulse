-- WEB-BE-064: closure detection for restaurants the daily refresh never read.
--
-- Additive only: one new table, two new nullable columns, one new cron job and
-- a larger batch on an existing one. Nothing is dropped, renamed or tightened.
--
-- restaurant_closure_reviews holds findings a person decides on:
--   place_not_found  Places answered 404 for the stored google_place_id
--   no_place_match   a row with no place id had no confident Places match
--   visitor_report   reserved for WEB-FEAT-102 (the Report closed control)
-- At most one OPEN finding per restaurant and reason (partial unique index);
-- bulk-update-restaurants treats the 23505 as "already queued".
--
-- restaurants.promotion_hold_reason: set to 'place_not_found' with that
-- finding, so the row stops being promotable (isRestaurantPromotable,
-- WEB-BE-063) while hours_checked_at says it was just checked. Cleared when a
-- person resolves the finding (WEB-FEAT-102).
--
-- restaurants.place_lookup_checked_at: when the name-and-address lookup last
-- answered for a row with no place id, so it is not re-searched at the head of
-- every batch (retried after 90 days).

CREATE TABLE IF NOT EXISTS public.restaurant_closure_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('place_not_found', 'no_place_match', 'visitor_report')),
  source text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_closure_reviews_one_open
  ON public.restaurant_closure_reviews (restaurant_id, reason)
  WHERE resolved_at IS NULL AND reason <> 'visitor_report';

CREATE INDEX IF NOT EXISTS restaurant_closure_reviews_open_created
  ON public.restaurant_closure_reviews (created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.restaurant_closure_reviews ENABLE ROW LEVEL SECURITY;

-- Admins read and resolve. No anon or authenticated write policy: inserts come
-- from the service role (bulk-update-restaurants) and, for visitor reports,
-- from a validating edge function or RPC (WEB-FEAT-102).
DROP POLICY IF EXISTS "Admins read closure reviews" ON public.restaurant_closure_reviews;
CREATE POLICY "Admins read closure reviews"
  ON public.restaurant_closure_reviews FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins resolve closure reviews" ON public.restaurant_closure_reviews;
CREATE POLICY "Admins resolve closure reviews"
  ON public.restaurant_closure_reviews FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS promotion_hold_reason text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS place_lookup_checked_at timestamptz;

-- Schedules. Credentials from Vault via public.app_secret(), as
-- 20261108000103 does. Idempotent; a no-op without pg_cron.
--
-- COST. restaurant-hours-refresh goes from 20 to 25 rows a day because it now
-- also reads rows with a place id and no hours. 25 a day re-reads about 750
-- rows per 30-day window; the table was about 600 restaurants in the docs'
-- most recent counts (not probed for this migration), so the whole table fits
-- inside staleDays with headroom. One Place Details call per row at the
-- Enterprise SKU (regularOpeningHours).
-- restaurant-place-lookup: at most 25 Text Search Pro calls a day (owner
-- decision 2026-11-21), only for rows with no place id, each retried at most
-- once per 90 days.
--
-- ORDER. Apply this migration before deploying the new bulk-update-restaurants:
-- the new function writes promotion_hold_reason and place_lookup_checked_at.
-- The lookup body also carries hoursOnly: true, so against a function that
-- predates placeLookup the call runs the harmless hours fill mode instead of
-- the default full enrichment (which rewrites descriptions and contacts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping restaurant closure schedules';
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
        body    := jsonb_build_object('hoursOnly', true, 'staleDays', 30, 'batchSize', 25),
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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restaurant-place-lookup') THEN
    PERFORM cron.unschedule('restaurant-place-lookup');
  END IF;

  PERFORM cron.schedule(
    'restaurant-place-lookup',
    '13 10 * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'restaurant-place-lookup not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/bulk-update-restaurants',
        body    := jsonb_build_object('placeLookup', true, 'hoursOnly', true, 'batchSize', 25),
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
