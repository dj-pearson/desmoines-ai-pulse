-- AOS-CS-006: in-app support chat wired to the first-responder. Registers the
-- support-chat agent (on-demand, budgeted). No new tables — chats that can't be
-- resolved create a support_ticket (channel in_app) with the transcript attached.
-- Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('support-chat', 'In-App Support Chat', 'support',
   'In-app support chat grounded in the KB (AOS-CS-003); unresolved chats or a human request open a support_ticket (channel in_app) with the transcript attached and escalate to tier-2. Available to all tiers (AOS-CS-006).',
   NULL, true, 0.75, 40.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;
