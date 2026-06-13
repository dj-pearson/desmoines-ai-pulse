-- WEB-PERF-007: Real-user web-vitals (RUM) monitoring with automated regression alerts.
--
-- Additive only: two new tables (raw samples + weekly rollup), one SECURITY
-- DEFINER percentile RPC, and one weekly pg_cron job. No drops, no renames, no
-- tightening — safe for live web + iOS/Android (mobile never touches these).
--
-- Data flow:
--   1. The web client (idle, sampled, DNT-respecting) beacons Core Web Vitals
--      to the `web-vitals-collector` edge fn, which inserts into web_vitals_samples
--      with the service role (RLS admin-read only — samples are anonymous, no PII).
--   2. The weekly `web-vitals-rollup` edge fn (jobRunner-wrapped) computes p75 per
--      metric per page-group for the trailing 7 days vs the prior 7 days, upserts
--      web_vitals_weekly, alerts the admin on a >20% regression or budget breach,
--      and prunes raw samples older than 90 days.
--   3. The admin Web Vitals panel renders web_vitals_weekly as a trend chart.

-- 1. Raw samples ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_vitals_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,                 -- LCP | CLS | INP | TTFB | FCP
  value double precision NOT NULL,      -- ms (CLS is unitless)
  rating text,                          -- good | needs-improvement | poor
  page_group text NOT NULL,             -- normalized route bucket (e.g. event-detail)
  navigation_type text,                 -- navigate | reload | back-forward | ...
  connection_type text,                 -- 4g | 3g | slow-2g | ... (Network Info API)
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.web_vitals_samples IS
  'WEB-PERF-007: anonymous, sampled real-user Core Web Vitals measurements. No PII; inserted by the web-vitals-collector edge fn via the service role. Pruned to 90 days by the weekly rollup job.';

-- Hot path for the rollup percentile query.
CREATE INDEX IF NOT EXISTS idx_web_vitals_samples_group_metric_created
  ON public.web_vitals_samples (page_group, metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_vitals_samples_created
  ON public.web_vitals_samples (created_at);

ALTER TABLE public.web_vitals_samples ENABLE ROW LEVEL SECURITY;

-- Admin-read only. Inserts are service-role (BYPASSRLS) so no client write policy
-- exists — anon/authenticated callers can neither read nor write the raw table.
DROP POLICY IF EXISTS "Admins can read web vitals samples" ON public.web_vitals_samples;
CREATE POLICY "Admins can read web vitals samples"
  ON public.web_vitals_samples
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 2. Weekly rollup ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_vitals_weekly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,             -- UTC date of the trailing-7d window start
  page_group text NOT NULL,
  metric text NOT NULL,
  p75 double precision NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  prev_p75 double precision,            -- p75 of the prior 7-day window (nullable: no prior data)
  pct_change double precision,          -- (p75 - prev_p75) / prev_p75 * 100
  breaches_budget boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, page_group, metric)
);

COMMENT ON TABLE public.web_vitals_weekly IS
  'WEB-PERF-007: weekly p75-per-metric-per-page-group rollup of web_vitals_samples, with week-over-week delta and budget-breach flag. Powers the admin Web Vitals trend panel.';

CREATE INDEX IF NOT EXISTS idx_web_vitals_weekly_week
  ON public.web_vitals_weekly (week_start DESC);

ALTER TABLE public.web_vitals_weekly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read web vitals weekly" ON public.web_vitals_weekly;
CREATE POLICY "Admins can read web vitals weekly"
  ON public.web_vitals_weekly
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 3. Percentile RPC ---------------------------------------------------------
-- Computes p75 per (page_group, metric) over a time window. SECURITY DEFINER so
-- the service-role rollup fn (and only it / admins) can aggregate the admin-read
-- samples table without per-row RLS overhead.
CREATE OR REPLACE FUNCTION public.get_web_vitals_p75(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS TABLE (
  page_group text,
  metric text,
  p75 double precision,
  sample_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.page_group,
    s.metric,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY s.value)::double precision AS p75,
    count(*) AS sample_count
  FROM public.web_vitals_samples s
  WHERE s.created_at >= p_since
    AND s.created_at < p_until
  GROUP BY s.page_group, s.metric;
$$;

REVOKE ALL ON FUNCTION public.get_web_vitals_p75(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_web_vitals_p75(timestamptz, timestamptz) TO service_role, authenticated;

-- 4. Weekly schedule --------------------------------------------------------
-- Mondays 16:00 UTC (~10-11am Central). Routes through the WEB-AUTO-001 jobRunner
-- (Job Health panel + failure alerts); the fn itself emails on metric regression.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('web-vitals-rollup-weekly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'web-vitals-rollup-weekly');

    PERFORM cron.schedule(
      'web-vitals-rollup-weekly',
      '0 16 * * 1',  -- Mondays 16:00 UTC (~10-11am Central)
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/web-vitals-rollup',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('manual', false)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
