-- AOS-CORE-008: extend agent_run_summary with 30-day rollups for the control
-- plane dashboard (the view already carries the 7-day rollup from AOS-CORE-002).
-- CREATE OR REPLACE keeps every existing column in order and appends the new
-- 30-day columns at the end — additive per CLAUDE.md.

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
),
rollup30 AS (
  SELECT
    agent_key,
    count(*) AS runs_30d,
    count(*) FILTER (WHERE status = 'success') AS successes_30d,
    count(*) FILTER (WHERE status IN ('failed', 'failure')) AS failures_30d,
    COALESCE(sum(items_processed), 0) AS items_processed_30d,
    COALESCE(sum(items_escalated), 0) AS items_escalated_30d,
    COALESCE(sum(cost_usd), 0) AS cost_usd_30d
  FROM public.automation_job_runs
  WHERE agent_key IS NOT NULL
    AND started_at > now() - INTERVAL '30 days'
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
  COALESCE(ro.cost_usd_7d, 0)        AS cost_usd_7d,
  -- 30-day rollup (appended for AOS-CORE-008)
  COALESCE(r30.runs_30d, 0)            AS runs_30d,
  COALESCE(r30.successes_30d, 0)       AS successes_30d,
  COALESCE(r30.failures_30d, 0)        AS failures_30d,
  COALESCE(r30.items_processed_30d, 0) AS items_processed_30d,
  COALESCE(r30.items_escalated_30d, 0) AS items_escalated_30d,
  COALESCE(r30.cost_usd_30d, 0)        AS cost_usd_30d
FROM public.agent_registry ar
LEFT JOIN latest l ON l.agent_key = ar.agent_key
LEFT JOIN rollup ro ON ro.agent_key = ar.agent_key
LEFT JOIN rollup30 r30 ON r30.agent_key = ar.agent_key;
