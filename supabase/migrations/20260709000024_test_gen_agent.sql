-- AOS-DEV-004: register the test-coverage agent. Runs in CI (needs Claude Code
-- + the test harness), generates deterministic tests, and opens PRs for human
-- merge. No pg_cron — the workflow is manual-dispatch (safe rollout). Additive.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('test-coverage-agent', 'Test Coverage Agent', 'dev',
   'Generates deterministic tests for high-value uncovered critical paths (auth, subscription/entitlement, edge-contract decode) as CI-verified PRs; prioritizes error-cluster hotspots (AOS-DEV-004/001).',
   NULL, true, 0.90, 60, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
