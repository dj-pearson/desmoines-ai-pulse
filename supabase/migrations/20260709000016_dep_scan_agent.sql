-- AOS-SEC-002: register the dependency & CVE scanner agent. The scan runs in CI
-- (npm audit needs Node) and posts to agent-dep-scan, so there is no pg_cron
-- here — the GitHub Actions workflow is the schedule. It only opens/closes
-- remediation tasks, so it ships live. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('dependency-cve-scanner', 'Dependency CVE Scanner', 'security',
   'Ingests npm audit results (from CI) and opens tier-appropriate remediation tasks; low/moderate-with-fix as tier-1 (AOS-DEV-003), high/critical as tier-2. Auto-closes resolved CVEs (AOS-SEC-002).',
   NULL, true, 0.95, NULL, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
