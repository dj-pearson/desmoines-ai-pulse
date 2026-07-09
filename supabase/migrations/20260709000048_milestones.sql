-- AOS-NURTURE-006: loyalty / streak / milestone recognition. Records milestones
-- (in-app: user-readable) and optionally emails recognition within caps.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.user_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  milestone_type TEXT NOT NULL,        -- saves | reviews | anniversary | streak
  milestone_value INTEGER NOT NULL,    -- threshold crossed (count / years / weeks)
  label TEXT,
  emailed BOOLEAN NOT NULL DEFAULT false,
  send_id UUID,
  acknowledged_at TIMESTAMPTZ,         -- user dismissed the in-app recognition
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_type, milestone_value)
);

CREATE INDEX IF NOT EXISTS idx_user_milestones_user ON public.user_milestones (user_id, created_at DESC);

ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;

-- Users see (and can acknowledge) their own milestones — this is the in-app surface.
DO $$ BEGIN
  CREATE POLICY "user_milestones_owner_read" ON public.user_milestones
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "user_milestones_owner_ack" ON public.user_milestones
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "user_milestones_admin_read" ON public.user_milestones
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.user_milestones IS
  'Loyalty/streak/milestone recognition (AOS-NURTURE-006). User-readable = the in-app surface; optional email within caps.';

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('milestone-recognition', 'Milestone Recognition', 'nurture',
   'Detects loyalty milestones (saves, reviews, anniversaries, weekly streaks) and delivers lightweight recognition (in-app + optional email) within frequency caps; opt-out respected, on-brand + quality-checked (AOS-NURTURE-006).',
   '0 14 * * *', true, 0.90, 15.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('milestone-recognition')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'milestone-recognition');
    PERFORM cron.schedule(
      'milestone-recognition',
      '0 14 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-milestones',
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
