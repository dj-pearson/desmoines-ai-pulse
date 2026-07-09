-- AOS-CS-008: human agent ticket console. Adds duplicate-merge support and a
-- canned-responses library; registers the support-console actor for audits.
-- Additive only.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_merged_into ON public.support_tickets (merged_into) WHERE merged_into IS NOT NULL;

-- Canned responses library (admin-managed).
CREATE TABLE IF NOT EXISTS public.support_canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "canned_responses_admin_read" ON public.support_canned_responses
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.support_canned_responses (title, body, category) VALUES
  ('Greeting', 'Hi! Thanks for reaching out to Des Moines Insider support. I''d be happy to help.', 'general'),
  ('Ask for details', 'To help me look into this, could you share the email on your account and a bit more detail about what you''re seeing?', 'general'),
  ('Cancellation confirmed', 'Your subscription has been set to cancel at the end of the current billing period. You''ll keep access until then, and you can resume anytime before it ends.', 'billing'),
  ('Resolved follow-up', 'I''ve gone ahead and resolved this for you. Please let us know if there''s anything else we can help with!', 'general')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.support_canned_responses IS
  'Canned reply library for the human support console (AOS-CS-008).';

-- Register the console actor (for audit attribution; no schedule).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('support-console', 'Support Console', 'support',
   'Human tier-2/3 ticket workspace: full thread, user context, AI-suggested replies, canned responses + KB insertion, assignment, internal notes, merge-duplicate. Sends audited (AOS-CS-008).',
   NULL, true, 0.95, 20.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;
