-- ============================================================================
-- WEB-DB-004: Add missing indexes on foreign-key columns (CRM + related tables)
-- ============================================================================
-- Unindexed FK columns force sequential scans on joins/filters and slow the
-- ON DELETE SET NULL / CASCADE maintenance Postgres performs on the referenced
-- parent. All indexes below are additive.
--
-- Note on CONCURRENTLY: these statements run inside the migration transaction
-- (supabase db push), where CREATE INDEX CONCURRENTLY is not permitted, and the
-- target tables are new and small, so a plain CREATE INDEX takes a negligible
-- lock. This matches the existing CRM migrations' `CREATE INDEX IF NOT EXISTS`
-- style. Already-covered FK columns (crm_opportunities.account_id,
-- outreach_sends.lead_id, proposals.opportunity_id, crm_activities.opportunity_id)
-- are intentionally omitted.
-- ============================================================================

-- crm_accounts
CREATE INDEX IF NOT EXISTS idx_crm_accounts_advertiser_user
  ON public.crm_accounts (advertiser_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_owner
  ON public.crm_accounts (owner);

-- crm_leads
CREATE INDEX IF NOT EXISTS idx_crm_leads_prospect_lead
  ON public.crm_leads (prospect_lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_account
  ON public.crm_leads (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner
  ON public.crm_leads (owner);

-- crm_opportunities
CREATE INDEX IF NOT EXISTS idx_crm_opps_lead
  ON public.crm_opportunities (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_owner
  ON public.crm_opportunities (owner);
CREATE INDEX IF NOT EXISTS idx_crm_opps_campaign
  ON public.crm_opportunities (campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_assigned_closer
  ON public.crm_opportunities (assigned_closer);

-- proposals
CREATE INDEX IF NOT EXISTS idx_proposals_account
  ON public.proposals (account_id);

-- crm_activities
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead
  ON public.crm_activities (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_actor
  ON public.crm_activities (actor);
