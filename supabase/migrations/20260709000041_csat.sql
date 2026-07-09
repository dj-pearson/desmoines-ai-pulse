-- AOS-CS-007: post-resolution CSAT loop. On resolution a CSAT prompt is sent;
-- scores are stored against the ticket + agent run; a low score re-escalates the
-- ticket to tier-2 with the original context. Additive only.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,               -- auto | human
  ADD COLUMN IF NOT EXISTS csat_prompt_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS csat_score INTEGER;

-- Stamp resolved_at when a ticket first becomes resolved.
CREATE OR REPLACE FUNCTION public.support_ticket_stamp_resolved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_ticket_stamp_resolved ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_stamp_resolved
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_stamp_resolved();

-- CSAT records (one per submission), linked to ticket + optionally an agent run.
CREATE TABLE IF NOT EXISTS public.support_csat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  channel TEXT,                    -- ticket channel at resolution (web_form|email|in_app)
  resolved_by TEXT,                -- auto | human
  run_id UUID,                     -- agent run that handled it, if known
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_csat_created ON public.support_csat (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_csat_ticket ON public.support_csat (ticket_id);

ALTER TABLE public.support_csat ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "support_csat_admin_read" ON public.support_csat
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Users can read CSAT for their own tickets.
DO $$ BEGIN
  CREATE POLICY "support_csat_user_read" ON public.support_csat
    FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.support_csat IS
  'Post-resolution CSAT scores (AOS-CS-007). Low scores auto-re-escalate the ticket to tier-2.';

-- Register the CSAT agent, scheduled hourly (sends prompts on newly-resolved tickets).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('csat-agent', 'CSAT Agent', 'support',
   'Sends a lightweight CSAT prompt after resolution (in-app/email), stores scores against the ticket + agent run, and re-escalates low scores to tier-2 with the original context; CSAT trend surfaced in the digest (AOS-CS-007).',
   '0 * * * *', true, 0.95, NULL, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('csat-agent')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'csat-agent');
    PERFORM cron.schedule(
      'csat-agent',
      '0 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-csat',
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
