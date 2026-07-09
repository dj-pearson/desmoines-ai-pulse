-- AOS-DEV-002: register the autonomous fix agent. It runs in CI (needs git +
-- Claude Code), claims tier-1 dev tasks, and opens DRAFT PRs for human merge —
-- never auto-merges — so no pg_cron; the workflow is manual-dispatch (safe
-- rollout). Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('dev-fix-agent', 'Autonomous Fix Agent', 'dev',
   'Picks tier-1 dev tasks, implements a scoped fix on a claude/aos-fix branch in CI, runs validate, and opens a DRAFT PR for human merge; repeated failures escalate to tier-2 (AOS-DEV-002).',
   NULL, true, 0.90, 60, 'root_admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
