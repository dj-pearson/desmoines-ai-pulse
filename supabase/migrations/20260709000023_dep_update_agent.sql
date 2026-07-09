-- AOS-DEV-003: register the dependency-update agent. Runs in CI (needs npm),
-- opens grouped non-breaking PRs and escalates majors to tier-2. No pg_cron —
-- the GitHub Actions workflow is the schedule. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('dependency-update-agent', 'Dependency Update Agent', 'dev',
   'Proposes grouped non-breaking (patch/minor) dependency updates as CI-gated PRs; escalates majors to tier-2 review; prioritizes security-affected packages (AOS-DEV-003 / AOS-SEC-002).',
   NULL, true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
