-- WEB-PERF-007: real-user web-vitals (RUM) collection.
--
-- Anonymous, sampled beacons (LCP/CLS/INP/TTFB) from real sessions. Additive +
-- safe. Anyone may INSERT (anonymous RUM); there is NO select policy, so the raw
-- rows aren't publicly readable — the admin trend reads the weekly job's
-- aggregated run metadata (service role), mirroring the data-quality KPI flow.

CREATE TABLE IF NOT EXISTS public.web_vitals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric      text NOT NULL,             -- LCP | CLS | INP | TTFB | FCP
  value       double precision NOT NULL,
  rating      text,                      -- good | needs-improvement | poor
  page_group  text NOT NULL,             -- normalized route, e.g. /events/detail
  path        text,
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_created ON public.web_vitals (created_at);
CREATE INDEX IF NOT EXISTS idx_web_vitals_metric_group
  ON public.web_vitals (metric, page_group, created_at);

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

-- Anonymous beacons may insert; no SELECT policy => not publicly readable.
DROP POLICY IF EXISTS "web_vitals_insert_any" ON public.web_vitals;
CREATE POLICY "web_vitals_insert_any"
  ON public.web_vitals FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.web_vitals IS
  'WEB-PERF-007: sampled anonymous RUM web-vitals; aggregated weekly into job metadata.';
