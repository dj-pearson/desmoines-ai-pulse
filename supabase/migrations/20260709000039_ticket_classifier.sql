-- AOS-CS-005: ticket sentiment + priority classifier with SLA. Adds the
-- classification fields to support_tickets and a feedback table for human
-- corrections. The classifier agent sets sentiment/urgency/priority/sla_due_at;
-- an SLA-breach guard escalates unhandled fast-track tickets before breach.
-- Additive only.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS urgency TEXT,                          -- low | medium | high | critical
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS classification_source TEXT,            -- agent | human
  ADD COLUMN IF NOT EXISTS sla_escalated_at TIMESTAMPTZ;          -- set once we pre-escalate

-- Human corrections (feedback loop for misclassifications).
CREATE TABLE IF NOT EXISTS public.support_ticket_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  corrected_sentiment TEXT,
  corrected_urgency TEXT,
  corrected_priority TEXT,
  corrected_category TEXT,
  prior JSONB,           -- the agent's classification being corrected
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_feedback_ticket ON public.support_ticket_feedback (ticket_id, created_at DESC);

ALTER TABLE public.support_ticket_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ticket_feedback_admin_read" ON public.support_ticket_feedback
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.support_tickets.urgency IS 'AOS-CS-005 classifier: low | medium | high | critical.';
COMMENT ON TABLE public.support_ticket_feedback IS
  'Human corrections to agent ticket classification (AOS-CS-005) — captured for model feedback.';

-- Register the classifier agent, scheduled every 10 minutes.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('ticket-classifier', 'Ticket Classifier', 'support',
   'Classifies new support tickets (sentiment, urgency, category), sets priority + sla_due_at, fast-tracks negative/high-urgency, and pre-escalates unhandled fast-track tickets before SLA breach. Corrections captured for feedback (AOS-CS-005).',
   '*/10 * * * *', true, 0.90, 15.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ticket-classifier')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ticket-classifier');
    PERFORM cron.schedule(
      'ticket-classifier',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-ticket-classifier',
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
