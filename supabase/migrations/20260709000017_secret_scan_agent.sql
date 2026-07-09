-- AOS-SEC-003: register the secret-leak scanner agent. The scan runs in CI
-- (needs git) and posts to agent-secret-scan, so no pg_cron — the GitHub
-- Actions workflow is the schedule. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('secret-leak-scanner', 'Secret Leak Scanner', 'security',
   'Ingests secret-pattern findings (locations only, no values) from the CI tree scan and opens a tier-3 incident with the rotation runbook; auto-closes when clean (AOS-SEC-003).',
   NULL, true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
