-- AOS-NURTURE-001: user lifecycle-stage model. Adds a computed lifecycle_stage
-- to profiles (maintained by a scheduled agent), records stage transitions for
-- nurture agents to react to, and exposes a summary view. PII-safe: only
-- non-PII signal summaries are stored. Additive only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT,            -- new|onboarding|active|at_risk|dormant|churned|reactivated
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_signals JSONB;         -- non-PII: days/counts/flags only

CREATE INDEX IF NOT EXISTS idx_profiles_lifecycle_stage ON public.profiles (lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_profiles_lifecycle_updated ON public.profiles (lifecycle_updated_at NULLS FIRST);

-- Stage-transition history (nurture agents react to changes).
CREATE TABLE IF NOT EXISTS public.user_lifecycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  reason TEXT,
  signals JSONB,           -- non-PII summary at transition time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_history_user ON public.user_lifecycle_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_history_to_stage ON public.user_lifecycle_history (to_stage, created_at DESC);

ALTER TABLE public.user_lifecycle_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lifecycle_history_admin_read" ON public.user_lifecycle_history
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin summary: user counts by stage.
CREATE OR REPLACE VIEW public.user_lifecycle_summary AS
SELECT COALESCE(lifecycle_stage, 'unclassified') AS stage, count(*) AS users
FROM public.profiles
GROUP BY COALESCE(lifecycle_stage, 'unclassified');

COMMENT ON VIEW public.user_lifecycle_summary IS
  'User counts by lifecycle stage (AOS-NURTURE-001). Admin-read via underlying profiles RLS.';
COMMENT ON COLUMN public.profiles.lifecycle_stage IS
  'AOS-NURTURE-001 computed stage: new|onboarding|active|at_risk|dormant|churned|reactivated. Segmentation input for nurture agents.';

-- Register the lifecycle classifier, scheduled daily at 05:00 UTC.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('lifecycle-classifier', 'Lifecycle Classifier', 'nurture',
   'Classifies each user into a lifecycle stage from activity signals (signup age, last activity, recent saves, subscription state), records transitions, and exposes stage as a segmentation input. PII-safe (AOS-NURTURE-001).',
   '0 5 * * *', true, 0.90, NULL, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('lifecycle-classifier')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lifecycle-classifier');
    PERFORM cron.schedule(
      'lifecycle-classifier',
      '0 5 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-lifecycle',
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
