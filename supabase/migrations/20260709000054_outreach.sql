-- AOS-PROSPECT-004: outreach sequencing (guardrailed). Templates (step-1
-- approval-gated), a send ledger, and a suppression list. Adds business-contact
-- email + a sequence-stop flag to crm_leads. Additive only.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS contact_email TEXT,          -- business-contact basic (not consumer PII)
  ADD COLUMN IF NOT EXISTS outreach_stopped BOOLEAN NOT NULL DEFAULT false; -- reply/opt-out halts the sequence

-- Sequence templates. Step 1 must be approved before the sequence can auto-run.
CREATE TABLE IF NOT EXISTS public.outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step INTEGER NOT NULL UNIQUE,        -- 1 = intro, 2 = follow-up, 3 = final
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  approval_id UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Send ledger.
CREATE TABLE IF NOT EXISTS public.outreach_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  email TEXT NOT NULL,
  resend_message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|delivered|opened|clicked|bounced|replied|failed|skipped
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_sends_lead ON public.outreach_sends (lead_id, created_at DESC);

-- Suppression list (opt-outs, bounces, do-not-contact).
CREATE TABLE IF NOT EXISTS public.outreach_suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  domain TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_suppression_email ON public.outreach_suppression (email);
CREATE INDEX IF NOT EXISTS idx_outreach_suppression_domain ON public.outreach_suppression (domain);

ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_suppression ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "outreach_templates_sales" ON public.outreach_templates FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "outreach_sends_sales_read" ON public.outreach_sends FOR SELECT TO authenticated USING (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "outreach_suppression_sales" ON public.outreach_suppression FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the 3-step sequence (step 1 unapproved — must be approved to run).
INSERT INTO public.outreach_templates (step, subject, body, approved) VALUES
  (1, 'Reach more of Des Moines with {{business_name}}', 'Hi there,\n\nI run partnerships at Des Moines Insider — locals use us to find events, restaurants, and things to do. {{business_name}} stood out, and I think our audience would love to discover you.\n\nWould you be open to a quick chat about featuring your business? No obligation.\n\nBest,\nThe Des Moines Insider team', false),
  (2, 'Following up — {{business_name}} + Des Moines Insider', 'Hi again,\n\nJust circling back in case my note got buried. We help local businesses get in front of engaged Des Moines residents. Happy to share a few options whenever works for you.\n\nBest,\nThe Des Moines Insider team', false),
  (3, 'Last note from Des Moines Insider', 'Hi,\n\nI won''t keep emailing — if featuring {{business_name}} to local audiences is ever of interest, just reply and I''ll take it from there. Wishing you a great season either way!\n\nBest,\nThe Des Moines Insider team', false)
ON CONFLICT (step) DO NOTHING;

COMMENT ON TABLE public.outreach_templates IS
  'Outreach sequence templates (AOS-PROSPECT-004). Step 1 is approval-gated (AOS-CORE-007) before the sequence can auto-run.';

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('outreach-sequencer', 'Outreach Sequencer', 'prospect',
   'Sends personalized multi-step outreach to qualified leads via existing email plumbing; step-1 template approval-gated before any auto-run, replies escalate to a human closer (never negotiates pricing), CAN-SPAM compliant (unsubscribe + address + suppression), frequency-capped, quality-checked, audited (AOS-PROSPECT-004).',
   '0 15 * * 3', true, 0.90, 20.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('outreach-sequencer')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outreach-sequencer');
    PERFORM cron.schedule(
      'outreach-sequencer',
      '0 15 * * 3',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-outreach',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
