-- AOS-PROSPECT-006: sales pipeline console + human closer handoff. Adds an
-- activity log and closer assignment; a won opportunity signals advertiser
-- onboarding (AOS-PROSPECT-007). Additive only.

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS assigned_closer UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_started BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'note',   -- note | call | email | stage_change | reply | suggestion_accepted
  note TEXT,
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_opp ON public.crm_activities (opportunity_id, created_at DESC);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_activities_sales" ON public.crm_activities FOR ALL TO authenticated USING (public.is_admin_or_sales()) WITH CHECK (public.is_admin_or_sales());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.crm_activities IS
  'CRM activity log (AOS-PROSPECT-006): notes, calls, emails, stage changes, replies. All human/agent actions on a deal.';
COMMENT ON COLUMN public.crm_opportunities.onboarding_started IS
  'Set when a won opportunity has triggered advertiser onboarding (AOS-PROSPECT-006 → AOS-PROSPECT-007).';
