-- AOS-CS-002: AI first-responder agent. Drafts grounded answers from the KB
-- (AOS-CS-003); high-confidence answers auto-send (after the AOS-GOV-004 quality
-- gate), low-confidence or sensitive tickets escalate to tier-2 with a suggested
-- draft. No new tables — uses support_tickets/messages + agent_tasks + audit.
-- Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('support-responder', 'Support First-Responder', 'support',
   'Drafts grounded answers from the support KB; high-confidence answers auto-send after the AOS-GOV-004 quality/safety gate, low-confidence or sensitive (billing/account/legal) tickets escalate to tier-2 with a suggested draft. Respects frequency/loop limits; a human-request forces escalation; every send/escalation is audited (AOS-CS-002).',
   '*/10 * * * *', true, 0.75, 30.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('support-responder')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-responder');
    PERFORM cron.schedule(
      'support-responder',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-support-responder',
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
