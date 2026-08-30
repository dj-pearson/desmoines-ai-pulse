-- AOS-PROSPECT-001: local-business discovery (advertiser lead sourcing). Creates
-- prospect_leads from existing content (restaurants/attractions/event venues) that
-- are not already advertisers. Deduped; source + fit captured. Additive only.

CREATE TABLE IF NOT EXISTS public.prospect_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  category TEXT,                       -- restaurant | attraction | event_organizer
  city TEXT,
  website TEXT,
  source TEXT NOT NULL,                -- existing_content:<table> (documented sources)
  source_ref TEXT,                     -- e.g. restaurants:<id>
  fit_reason TEXT,                     -- why this is a fit for advertising
  fit_score NUMERIC,                   -- 0..1
  status TEXT NOT NULL DEFAULT 'new',  -- new | contacted | qualified | disqualified | converted
  dedupe_key TEXT UNIQUE,              -- stable key to avoid duplicates
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_leads_status ON public.prospect_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_score ON public.prospect_leads (fit_score DESC NULLS LAST);

ALTER TABLE public.prospect_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "prospect_leads_admin_read" ON public.prospect_leads
    FOR SELECT TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "prospect_leads_admin_write" ON public.prospect_leads
    FOR UPDATE TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_prospect_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_prospect_leads_updated_at ON public.prospect_leads;
CREATE TRIGGER trg_prospect_leads_updated_at
  BEFORE UPDATE ON public.prospect_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_prospect_leads_updated_at();

COMMENT ON TABLE public.prospect_leads IS
  'Advertiser lead sourcing (AOS-PROSPECT-001). Discovered from existing content (no external scraping); deduped by dedupe_key.';

INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, mode, provider)
VALUES
  ('lead-sourcing', 'Lead Sourcing', 'prospect',
   'Discovers advertisable local businesses/organizers from existing content (restaurants/attractions/event venues) that are not already advertisers, deduped, capturing source + category + fit; runs budgeted/audited. No scraping of gated/PII sources (AOS-PROSPECT-001).',
   '0 6 * * 1', true, 0.90, 15.00, 'admin', 'live', 'anthropic')
ON CONFLICT (agent_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('lead-sourcing')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-sourcing');
    PERFORM cron.schedule(
      'lead-sourcing',
      '0 6 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-lead-sourcing',
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
