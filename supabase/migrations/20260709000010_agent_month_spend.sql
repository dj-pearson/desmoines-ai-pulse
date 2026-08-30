-- AOS-GOV-001: per-agent month-to-date spend view for the budget hard-stop and
-- the budget dashboard tile. Additive (new view; reads existing tables).

CREATE OR REPLACE VIEW public.agent_month_spend AS
SELECT
  ar.agent_key,
  ar.name,
  ar.category,
  ar.monthly_cost_budget_usd,
  COALESCE(sum(r.cost_usd) FILTER (WHERE r.started_at >= date_trunc('month', now())), 0)   AS spend_mtd,
  COALESCE(sum(r.tokens_used) FILTER (WHERE r.started_at >= date_trunc('month', now())), 0) AS tokens_mtd,
  COALESCE(count(*)          FILTER (WHERE r.started_at >= date_trunc('month', now())), 0)  AS runs_mtd
FROM public.agent_registry ar
LEFT JOIN public.automation_job_runs r ON r.agent_key = ar.agent_key
GROUP BY ar.agent_key, ar.name, ar.category, ar.monthly_cost_budget_usd;

COMMENT ON VIEW public.agent_month_spend IS
  'Per-agent month-to-date LLM/API spend vs budget (AOS-GOV-001). Admin-read via the underlying agent_registry + automation_job_runs RLS.';
