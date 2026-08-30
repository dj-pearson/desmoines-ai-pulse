-- AOS-NURTURE-005: dormant-user re-engagement agent. Registers the agent; adds a
-- suppression stamp so repeatedly-unresponsive users are aged out. Coordination
-- across nurture agents is done via the shared nurture_sends ledger. Additive only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reengage_suppressed_at TIMESTAMPTZ;  -- aged out after repeated non-response

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('dormant-reengagement', 'Dormant Re-engagement', 'nurture',
   'Nudges dormant lifecycle users back (what they missed, saved-search alert, personalized highlight) on a conservative cadence; hard frequency caps + consent, coordinated against all nurture sends (no overlap), reactivations measured, unresponsive users aged out (AOS-NURTURE-005).',
   '0 16 * * 2', true, 0.90, 20.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dormant-reengagement')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dormant-reengagement');
    PERFORM cron.schedule(
      'dormant-reengagement',
      '0 16 * * 2',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-reengagement',
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
