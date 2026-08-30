-- AOS-NURTURE-003: churn-risk prediction + win-back agent. Adds a churn score to
-- profiles and a win-back intervention ledger (for effectiveness measurement).
-- Offers are policy-bounded and approval-gated above a threshold. Additive only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS churn_risk_score NUMERIC,     -- 0..1
  ADD COLUMN IF NOT EXISTS churn_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_churn_score ON public.profiles (churn_risk_score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.winback_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  churn_score NUMERIC,
  play TEXT NOT NULL,                    -- value_reminder | offer
  offer_pct NUMERIC,                     -- discount offered (null for value_reminder)
  status TEXT NOT NULL DEFAULT 'sent',   -- sent | approval_pending | retained | churned
  send_id UUID,                          -- nurture_sends.id
  approval_id UUID,                      -- agent_action_approvals.id (above-threshold offers)
  outcome_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_user ON public.winback_interventions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_winback_status ON public.winback_interventions (status, created_at DESC);

ALTER TABLE public.winback_interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "winback_admin_read" ON public.winback_interventions
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.winback_interventions IS
  'Win-back interventions + outcomes (AOS-NURTURE-003). Effectiveness = retained vs churned after intervention.';

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('churn-winback', 'Churn & Win-back', 'nurture',
   'Scores churn risk from engagement/subscription signals, moves high-risk users to at_risk, and runs a win-back play (value reminder, or in-policy offer); offers above a threshold are approval-gated (AOS-CORE-007). Effectiveness (retained vs churned) measured (AOS-NURTURE-003).',
   '30 5 * * *', true, 0.90, 25.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('churn-winback')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'churn-winback');
    PERFORM cron.schedule(
      'churn-winback',
      '30 5 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-churn-winback',
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
