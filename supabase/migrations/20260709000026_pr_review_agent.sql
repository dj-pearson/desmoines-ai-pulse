-- AOS-DEV-006: register the automated PR review agent. The review runs in CI
-- (deterministic, no LLM) and posts a summary here for an audited run record.
-- Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('pr-review-agent', 'PR Review Agent', 'dev',
   'Deterministically reviews PR diffs for CLAUDE.md compliance (destructive migrations, direct localStorage/process.env, unwrapped console, any); blocks on high-confidence violations, advisory on nits (AOS-DEV-006).',
   NULL, true, 0.95, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
