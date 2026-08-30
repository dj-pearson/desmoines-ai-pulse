-- AOS-SEC-006: register the RLS/config drift auditor. The audit runs in CI
-- (needs the repo tree) and posts to agent-config-audit, so no pg_cron — the
-- GitHub Actions workflow is the schedule. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('config-drift-auditor', 'Config Drift Auditor', 'security',
   'Regenerates the RLS audit + security config snapshot in CI and diffs against the committed baselines; opens a tier-2 task on new permissive-write/anon-write/missing-RLS/unpinned-definer findings or CORS/CSP/verify_jwt drift (AOS-SEC-006).',
   NULL, true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
