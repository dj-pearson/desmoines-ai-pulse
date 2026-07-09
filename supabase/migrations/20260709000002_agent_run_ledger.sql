-- AOS-CORE-002: Unified agent run ledger.
--
-- Rather than stand up a parallel table, extend the existing WEB-AUTO run ledger
-- (automation_job_runs, WEB-AUTO-001) into the agent ledger: link a run to a
-- registered agent, and record escalations, token usage, spend, and a summary.
-- All additive: new nullable columns, a LOOSENED status vocabulary, a new index,
-- and a new per-agent view. No existing column or behavior changes.

-- 1) Additive columns.
ALTER TABLE public.automation_job_runs
  ADD COLUMN IF NOT EXISTS agent_key TEXT
    REFERENCES public.agent_registry(agent_key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS items_escalated INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- 2) Loosen the status CHECK to the union of the job vocabulary
--    (running/success/failed/partial) and the agent vocabulary
--    (failure/escalated/skipped). Adding allowed values only widens the domain,
--    so it is additive-safe per CLAUDE.md (never denies a value the old writer
--    used).
ALTER TABLE public.automation_job_runs
  DROP CONSTRAINT IF EXISTS automation_job_runs_status_check;
ALTER TABLE public.automation_job_runs
  ADD CONSTRAINT automation_job_runs_status_check
  CHECK (status IN (
    'running', 'success', 'failed', 'partial',   -- WEB-AUTO job vocabulary
    'failure', 'escalated', 'skipped'             -- agent vocabulary
  ));

-- 3) Per-agent time-range index (partial: only agent-attributed runs).
CREATE INDEX IF NOT EXISTS idx_automation_job_runs_agent_started
  ON public.automation_job_runs (agent_key, started_at DESC)
  WHERE agent_key IS NOT NULL;

COMMENT ON COLUMN public.automation_job_runs.agent_key IS
  'Links a run to agent_registry.agent_key (AOS-CORE-002). NULL for legacy job-only runs.';

-- 4) Per-agent ledger view for the control plane (AOS-CORE-008): every
--    registered agent with its latest run and a 7-day rollup of reliability +
--    spend, joined to its registry budget so over-budget agents are visible.
CREATE OR REPLACE VIEW public.agent_run_summary AS
WITH latest AS (
  SELECT DISTINCT ON (agent_key)
    agent_key, started_at, finished_at, status,
    items_processed, items_failed, items_escalated, tokens_used, cost_usd, error, summary
  FROM public.automation_job_runs
  WHERE agent_key IS NOT NULL
  ORDER BY agent_key, started_at DESC
),
rollup AS (
  SELECT
    agent_key,
    count(*) AS runs_7d,
    count(*) FILTER (WHERE status = 'success') AS successes_7d,
    count(*) FILTER (WHERE status IN ('failed', 'failure')) AS failures_7d,
    count(*) FILTER (WHERE status = 'escalated') AS escalations_7d,
    count(*) FILTER (WHERE status = 'skipped') AS skips_7d,
    COALESCE(sum(items_processed), 0) AS items_processed_7d,
    COALESCE(sum(items_escalated), 0) AS items_escalated_7d,
    COALESCE(sum(tokens_used), 0) AS tokens_used_7d,
    COALESCE(sum(cost_usd), 0) AS cost_usd_7d
  FROM public.automation_job_runs
  WHERE agent_key IS NOT NULL
    AND started_at > now() - INTERVAL '7 days'
  GROUP BY agent_key
)
SELECT
  ar.agent_key,
  ar.name,
  ar.category,
  ar.enabled,
  ar.monthly_cost_budget_usd,
  l.started_at   AS last_run_at,
  l.finished_at  AS last_finished_at,
  l.status       AS last_status,
  l.items_processed AS last_items_processed,
  l.items_escalated AS last_items_escalated,
  l.tokens_used  AS last_tokens_used,
  l.cost_usd     AS last_cost_usd,
  l.error        AS last_error,
  l.summary      AS last_summary,
  COALESCE(ro.runs_7d, 0)            AS runs_7d,
  COALESCE(ro.successes_7d, 0)       AS successes_7d,
  COALESCE(ro.failures_7d, 0)        AS failures_7d,
  COALESCE(ro.escalations_7d, 0)     AS escalations_7d,
  COALESCE(ro.skips_7d, 0)           AS skips_7d,
  COALESCE(ro.items_processed_7d, 0) AS items_processed_7d,
  COALESCE(ro.items_escalated_7d, 0) AS items_escalated_7d,
  COALESCE(ro.tokens_used_7d, 0)     AS tokens_used_7d,
  COALESCE(ro.cost_usd_7d, 0)        AS cost_usd_7d
FROM public.agent_registry ar
LEFT JOIN latest l ON l.agent_key = ar.agent_key
LEFT JOIN rollup ro ON ro.agent_key = ar.agent_key;

COMMENT ON VIEW public.agent_run_summary IS
  'Per-agent latest run + 7-day reliability/spend rollup for the AOS control plane (AOS-CORE-002/008). Admin-read via the underlying automation_job_runs + agent_registry RLS.';
