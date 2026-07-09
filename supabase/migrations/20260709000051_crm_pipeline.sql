-- AOS-PROSPECT-002: lightweight CRM data model (leads/accounts/opportunities) for
-- the advertiser sales pipeline. Additive only; relates to prospect_leads and to
-- existing campaigns (a won opportunity links to a real advertiser/campaign)
-- WITHOUT modifying the campaigns/advertisements schema.

DO $$ BEGIN
  CREATE TYPE crm_opp_stage AS ENUM ('new', 'qualified', 'contacted', 'proposal', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Accounts (a business we might sell advertising to).
CREATE TABLE IF NOT EXISTS public.crm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  city TEXT,
  website TEXT,
  business_ref TEXT,                                  -- e.g. restaurants:<id> (provenance)
  advertiser_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- the real advertiser once won
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads (a discovered prospect entering the pipeline).
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_lead_id UUID REFERENCES public.prospect_leads(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'new',                 -- new | qualified | contacted | disqualified
  fit_score NUMERIC,
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opportunities (a deal moving through the pipeline).
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stage crm_opp_stage NOT NULL DEFAULT 'new',
  value NUMERIC NOT NULL DEFAULT 0,
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL, -- won → real campaign/advertiser
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON public.crm_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON public.crm_opportunities (stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_opps_account ON public.crm_opportunities (account_id);

ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;

-- Admin or sales-role users read/write; agents (service role) write, bypassing RLS.
CREATE OR REPLACE FUNCTION public.is_admin_or_sales()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin', 'sales'));
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_accounts', 'crm_leads', 'crm_opportunities'] LOOP
    EXECUTE format($f$
      DO $inner$ BEGIN
        CREATE POLICY "%1$s_sales_read" ON public.%1$s FOR SELECT TO authenticated USING (public.is_admin_or_sales());
      EXCEPTION WHEN duplicate_object THEN NULL; END $inner$;
    $f$, t);
    EXECUTE format($f$
      DO $inner$ BEGIN
        CREATE POLICY "%1$s_sales_write" ON public.%1$s FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
      EXCEPTION WHEN duplicate_object THEN NULL; END $inner$;
    $f$, t);
  END LOOP;
END $$;

-- updated_at triggers (reuse a shared function).
CREATE OR REPLACE FUNCTION public.set_crm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_accounts', 'crm_leads', 'crm_opportunities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_crm_updated_at()', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.crm_opportunities IS
  'Advertiser sales pipeline (AOS-PROSPECT-002). A won opportunity links to a real campaign via campaign_id — additive, no change to campaigns schema.';
