-- AOS-CS-004: billing/subscription self-service automation. Registers the agent
-- that handles tier-1 self-service (plan info, receipt resend, cancellation, and
-- in-policy refunds); out-of-policy refunds escalate to a tier-2 approval. No new
-- tables and no schema tightening — entitlement changes use cancel_at_period_end
-- so shipped clients keep reading the subscription_tier shape. Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('billing-selfservice', 'Billing Self-Service', 'support',
   'Tier-1 billing self-service within explicit policy: plan info, receipt resend, cancellation (reversible, period-end), and in-policy refunds via Stripe; out-of-policy refunds escalate to a tier-2 approval (AOS-CORE-007). All financial actions audited (AOS-CS-004).',
   NULL, true, 0.95, NULL, 'admin', 'live', 'stripe')
ON CONFLICT (agent_key) DO NOTHING;
