-- AOS-DEV-007: register the release-notes / changelog generator agent. The draft
-- is generated deterministically in CI (git log since last tag, no LLM) and
-- opened as a DRAFT PR; this endpoint records the audited run. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('release-notes-agent', 'Release Notes Agent', 'dev',
   'Aggregates conventional commits / merged PRs since the last tag into a categorized CHANGELOG draft, distinguishes web/iOS/Android surfaces, and flags backward-compat-sensitive changes; opens a DRAFT PR for human review (AOS-DEV-007).',
   NULL, true, 0.95, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;
