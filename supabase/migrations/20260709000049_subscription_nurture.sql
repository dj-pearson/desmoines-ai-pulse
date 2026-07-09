-- AOS-NURTURE-007: subscription lifecycle nurture (trial, dunning, upgrade).
-- Registers the agent; sends flow through the shared nurture_sends ledger, and
-- conversion is measured by stamping activated_at when a subscription converts.
-- No schema tightening (entitlement shapes shipped clients read are untouched).
-- Additive only.

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('subscription-nurture', 'Subscription Nurture', 'nurture',
   'Trial-ending reminders, failed-payment dunning (aligned to Stripe smart retries), and contextual upgrade prompts; entitlement-shape-safe, frequency-capped, unsubscribe-respecting, courtesy credits approval-gated. Recovery/upgrade conversion measured (AOS-NURTURE-007).',
   '0 13 * * *', true, 0.90, 25.00, 'admin', 'live', 'stripe')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('subscription-nurture')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-nurture');
    PERFORM cron.schedule(
      'subscription-nurture',
      '0 13 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-subscription-nurture',
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
