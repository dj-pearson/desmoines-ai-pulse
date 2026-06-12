-- WEB-AUTO-001: Autonomy control plane — observability for scheduled jobs.
--
-- Every cron / edge-function job records a row here via _shared/jobRunner.ts so
-- the admin Job Health panel can show last run, success rate, items processed,
-- and so terminal failures / missed runs can alert automatically.

CREATE TABLE IF NOT EXISTS public.automation_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  -- running | success | failed | partial
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'partial')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast "latest run per job" + time-range queries.
CREATE INDEX IF NOT EXISTS idx_automation_job_runs_job_started
  ON public.automation_job_runs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_job_runs_started
  ON public.automation_job_runs (started_at DESC);

ALTER TABLE public.automation_job_runs ENABLE ROW LEVEL SECURITY;

-- Admin read-only (writes happen via the service role from edge functions,
-- which bypasses RLS).
DROP POLICY IF EXISTS "automation_job_runs_admin_read" ON public.automation_job_runs;
CREATE POLICY "automation_job_runs_admin_read"
  ON public.automation_job_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.automation_job_runs IS
  'Run log for scheduled automation jobs (WEB-AUTO-001). Written by _shared/jobRunner.ts via the service role; admin-read only.';

-- ---------------------------------------------------------------------------
-- Health view: latest run + 7-day success rate per job. Admin-readable via the
-- table policy (the view runs with the querying user''s rights).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.automation_job_health AS
WITH latest AS (
  SELECT DISTINCT ON (job_name)
    job_name, started_at, finished_at, status, items_processed, items_failed, error, attempts
  FROM public.automation_job_runs
  ORDER BY job_name, started_at DESC
),
rates AS (
  SELECT
    job_name,
    count(*) FILTER (WHERE status = 'success') AS successes_7d,
    count(*) AS runs_7d,
    sum(items_processed) AS items_processed_7d,
    sum(items_failed) AS items_failed_7d
  FROM public.automation_job_runs
  WHERE started_at > now() - INTERVAL '7 days'
  GROUP BY job_name
)
SELECT
  l.job_name,
  l.started_at AS last_run_at,
  l.finished_at AS last_finished_at,
  l.status AS last_status,
  l.items_processed AS last_items_processed,
  l.items_failed AS last_items_failed,
  l.error AS last_error,
  l.attempts AS last_attempts,
  COALESCE(r.runs_7d, 0) AS runs_7d,
  COALESCE(r.successes_7d, 0) AS successes_7d,
  COALESCE(r.items_processed_7d, 0) AS items_processed_7d,
  COALESCE(r.items_failed_7d, 0) AS items_failed_7d
FROM latest l
LEFT JOIN rates r USING (job_name);

COMMENT ON VIEW public.automation_job_health IS
  'Per-job latest status + 7-day success/throughput rollup for the admin Job Health panel.';
