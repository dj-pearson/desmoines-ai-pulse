-- AOS-PROSPECT-003: lead enrichment + fit scoring. Adds enrichment fields to
-- crm_leads and registers the agent. Enrichment draws on data we already own
-- (size signals from the linked content); no PII beyond business-contact basics.
-- Additive only.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS enrichment JSONB,        -- non-PII: category, web presence, size signals
  ADD COLUMN IF NOT EXISTS fit_rationale TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,           -- high | medium | low
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_leads_priority ON public.crm_leads (priority, fit_score DESC NULLS LAST);

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('lead-enrichment', 'Lead Enrichment', 'prospect',
   'Enriches new CRM leads (category, web presence, size signals from linked content) and scores fit/priority; high-fit leads auto-advance to qualified (tier-1), ambiguous ones queue a tier-2 human qualification task. Budgeted; no PII beyond business basics (AOS-PROSPECT-003).',
   '0 7 * * 1', true, 0.90, 15.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('lead-enrichment')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-enrichment');
    PERFORM cron.schedule(
      'lead-enrichment',
      '0 7 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-lead-enrichment',
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
