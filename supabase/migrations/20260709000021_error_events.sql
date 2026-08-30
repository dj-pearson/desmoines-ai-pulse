-- AOS-DEV-001: production-error sink. Client (@/lib/errorHandler) and edge
-- functions log errors here (PII-scrubbed); the error-triage agent clusters
-- them into dev tasks. Additive only.

CREATE TABLE IF NOT EXISTS public.error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable cluster key: hash of component:action:normalized-message.
  signature TEXT NOT NULL,
  -- Redacted message (no PII — emails/tokens/ids/numbers scrubbed at ingest).
  message_redacted TEXT NOT NULL,
  component TEXT,
  action TEXT,
  route TEXT,
  severity TEXT NOT NULL DEFAULT 'error',
  source TEXT NOT NULL DEFAULT 'client', -- client | edge
  -- User UUID for affected-user counts only (not payload PII); nullable.
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_events_sig_created ON public.error_events (signature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_events_created ON public.error_events (created_at DESC);

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

-- Admin read-only; the service role (edge functions) writes, bypassing RLS.
DO $$ BEGIN
  CREATE POLICY "error_events_admin_read"
    ON public.error_events FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.error_events IS
  'PII-scrubbed production error sink (AOS-DEV-001). Written by the log-error edge function; clustered by the error-triage agent.';

-- Register the error-triage agent + schedule it every 30 minutes.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode)
VALUES
  ('error-triage', 'Error Triage', 'dev',
   'Clusters production error_events by signature into de-duplicated dev tasks (frequency, first/last seen, routes, user count); auto-closes resolved signatures (AOS-DEV-001).',
   '*/30 * * * *', true, 0.90, NULL, 'admin', 'live')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('error-triage')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'error-triage');
    PERFORM cron.schedule(
      'error-triage',
      '*/30 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-error-triage',
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
