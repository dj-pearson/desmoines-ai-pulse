-- Business Pro weekly report (growth roadmap #3, part 3).
--
-- Every Monday each live Business Pro subscriber gets one email per listing
-- with last week's page views, shares and contact clicks against the week
-- before. Weeks are Monday to Sunday in Central time, the same calendar
-- get_listing_owner_stats uses.
--
--   business_pro_weekly_report_rows()  service role only. One row per listing
--                                      where business_pro_active() is true,
--                                      with the owner's email and the numbers.
--   business_pro_report_sends          one row per (owner, listing, week). The
--                                      edge function inserts before it sends
--                                      and sends only if the insert happened,
--                                      so a rerun never mails twice. A failed
--                                      send deletes its row so a rerun retries.
--   cron 'business-pro-weekly-report'  Mondays 13:23 UTC (7:23 or 8:23 Central).
--
-- Additive only: two new objects and a schedule. Order: apply 20261102000006,
-- deploy business-pro-weekly-report, then apply this. Before the deploy the
-- cron call 404s and sends nothing.

CREATE TABLE IF NOT EXISTS public.business_pro_report_sends (
  user_id      uuid NOT NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('restaurant', 'attraction')),
  listing_id   uuid NOT NULL,
  week_start   date NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_type, listing_id, week_start)
);

ALTER TABLE public.business_pro_report_sends ENABLE ROW LEVEL SECURITY;
-- No policies: nobody but the service role reads or writes this.
REVOKE ALL ON public.business_pro_report_sends FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.business_pro_weekly_report_rows()
RETURNS TABLE (
  user_id      uuid,
  email        text,
  listing_type text,
  listing_id   uuid,
  listing_name text,
  week_start   date,
  week_end     date,
  views        bigint,
  shares       bigint,
  clicks       bigint,
  prev_views   bigint,
  prev_shares  bigint,
  prev_clicks  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  -- The Sunday that ended last week: isodow is 1 (Mon) .. 7 (Sun).
  v_end   date := v_today - extract(isodow FROM v_today)::int;
  v_start date := v_end - 6;
BEGIN
  RETURN QUERY
  WITH subs AS (
    SELECT DISTINCT s.user_id, s.listing_type, s.listing_id
    FROM public.business_subscriptions s
    WHERE public.business_pro_active(s.user_id, s.listing_type, s.listing_id)
  )
  SELECT
    subs.user_id,
    u.email::text,
    subs.listing_type,
    subs.listing_id,
    COALESCE(r.name, a.name)::text,
    v_start,
    v_end,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'view'  AND cm.date >= v_start), 0)::bigint,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'share' AND cm.date >= v_start), 0)::bigint,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'click' AND cm.date >= v_start), 0)::bigint,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'view'  AND cm.date <  v_start), 0)::bigint,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'share' AND cm.date <  v_start), 0)::bigint,
    COALESCE(SUM(cm.metric_value) FILTER (WHERE cm.metric_type = 'click' AND cm.date <  v_start), 0)::bigint
  FROM subs
  JOIN auth.users u ON u.id = subs.user_id
  LEFT JOIN public.restaurants r ON subs.listing_type = 'restaurant' AND r.id = subs.listing_id
  LEFT JOIN public.attractions a ON subs.listing_type = 'attraction' AND a.id = subs.listing_id
  LEFT JOIN public.content_metrics cm
         ON cm.content_type = subs.listing_type
        AND cm.content_id = subs.listing_id
        AND cm.date BETWEEN v_start - 7 AND v_end
  WHERE u.email IS NOT NULL
  GROUP BY subs.user_id, u.email, subs.listing_type, subs.listing_id, r.name, a.name;
END;
$$;

REVOKE ALL ON FUNCTION public.business_pro_weekly_report_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_pro_weekly_report_rows() TO service_role;

-- Credentials from Vault via public.app_secret(), as 20261020000006 does.
-- Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping business-pro-weekly-report schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'business-pro-weekly-report') THEN
    PERFORM cron.unschedule('business-pro-weekly-report');
  END IF;

  PERFORM cron.schedule(
    'business-pro-weekly-report',
    '23 13 * * 1',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'business-pro-weekly-report not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/business-pro-weekly-report',
        body    := jsonb_build_object('triggerSource', 'cron'),
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
