-- AOS-NURTURE-002: onboarding drip agent. Adds a shared nurture-send ledger
-- (reused by NURTURE-002/003/004) and registers the onboarding agent. Sends are
-- gated on lifecycle_stage + behavior, frequency-capped, unsubscribe-respecting,
-- and quality-checked. Additive only.

CREATE TABLE IF NOT EXISTS public.nurture_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- e.g. onboarding_welcome, winback, weekly_digest
  resend_message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|delivered|opened|clicked|bounced|complained|skipped|failed
  quality_score INTEGER,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,           -- user took the target action after this send
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nurture_sends_user_kind ON public.nurture_sends (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nurture_sends_created ON public.nurture_sends (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nurture_sends_agent ON public.nurture_sends (agent_key, created_at DESC);

ALTER TABLE public.nurture_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "nurture_sends_admin_read" ON public.nurture_sends
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.nurture_sends IS
  'Nurture email send ledger (AOS-NURTURE-002+): outcomes (open/click/activation) tracked per send; updated by resend-webhook.';

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('onboarding-drip', 'Onboarding Drip', 'nurture',
   'Staged onboarding sequence (welcome, key features, personalization, first-value) via existing email plumbing, gated on lifecycle_stage + behavior (skips completed steps), frequency-capped, unsubscribe-respecting, and AOS-GOV-004 quality-checked (AOS-NURTURE-002).',
   '0 */6 * * *', true, 0.90, 25.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('onboarding-drip')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-drip');
    PERFORM cron.schedule(
      'onboarding-drip',
      '0 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-onboarding-drip',
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
