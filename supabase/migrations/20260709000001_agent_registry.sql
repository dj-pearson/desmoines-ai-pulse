-- AOS-CORE-001: Agent registry — one authoritative record of every autonomous
-- agent (category, schedule, owner, enabled flag, tier policy, cost budget).
-- Autonomous behavior is currently scattered across edge functions + pg_cron
-- with no single place to see or govern it; this table is that place.
--
-- Additive + safe per CLAUDE.md compat rules: new type, new table, new RLS,
-- new trigger. No existing shape changes.

-- 1) Agent category enum. Wrapped so the migration is idempotent even though
--    Postgres has no CREATE TYPE IF NOT EXISTS.
DO $$ BEGIN
  CREATE TYPE agent_category AS ENUM (
    'dev',
    'maintain',
    'nurture',
    'prospect',
    'support',
    'manage',
    'security',
    'governance'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) The registry table.
CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category agent_category NOT NULL,
  description TEXT,
  -- pg_cron expression for scheduled agents; NULL for event-/trigger-driven ones.
  schedule_cron TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Minimum confidence at which the agent may act autonomously (tier-1). Below
  -- this it must escalate to a human queue (AOS-CORE-004/005).
  tier1_confidence_threshold NUMERIC NOT NULL DEFAULT 0.85,
  -- Soft monthly spend ceiling (LLM + API). NULL = no budget set yet.
  monthly_cost_budget_usd NUMERIC,
  -- Human role accountable for this agent (e.g. 'admin', 'root_admin').
  owner_role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_category ON agent_registry (category);
CREATE INDEX IF NOT EXISTS idx_agent_registry_enabled ON agent_registry (enabled);

-- 3) Auto-update updated_at.
DROP TRIGGER IF EXISTS set_agent_registry_updated_at ON agent_registry;
CREATE TRIGGER set_agent_registry_updated_at
  BEFORE UPDATE ON agent_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4) RLS: admin read AND write only (this is governance config, not public).
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin-only read for agent registry"
    ON agent_registry FOR SELECT
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin-only insert for agent registry"
    ON agent_registry FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin-only update for agent registry"
    ON agent_registry FOR UPDATE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin-only delete for agent registry"
    ON agent_registry FOR DELETE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service-role (edge functions calling getAgentConfig) bypasses RLS, so no
-- extra policy is needed for the agents themselves.

-- 5) Seed. Two groups so the registry reflects reality on day one:
--    (a) the WEB-AUTO scheduled jobs that already run (enabled = true), and
--    (b) the AOS program agents this initiative introduces, one canonical agent
--        per category, seeded disabled until their story lands (enabled = false).
--    schedule_cron mirrors docs/AUTOMATION_JOBS.md. ON CONFLICT keeps this
--    idempotent and non-destructive to any admin edits.
INSERT INTO agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role)
VALUES
  -- (a) Existing WEB-AUTO autonomous jobs (live today)
  ('content-ingest', 'Content Ingest (scrapers + adapters)', 'maintain',
    'Crawl partner sources and domain adapters, transform + insert events/restaurants/attractions (firecrawl-scraper, scrape-events, ai-crawler).', '0 6,18 * * *', true, 0.80, 40, 'admin'),
  ('data-quality-heal', 'Data Quality Heal', 'maintain',
    'Nightly geocode + SEO/GEO + image self-heal, <=25 rows/table/run (WEB-AUTO-003).', '30 2 * * *', true, 0.85, 15, 'admin'),
  ('backfill-images', 'Image Backfill Drain', 'maintain',
    'Drain the imageless-content backlog via the fallback chain; never-checked first, 7-day retry window (WEB-AUTO-018).', '7 * * * *', true, 0.85, 20, 'admin'),
  ('dedupe-content', 'Content Deduper', 'maintain',
    'Weekly trigram + proximity duplicate detection; auto-merge >=0.9, queue 0.7-0.9 for review (WEB-AUTO-005).', '15 3 * * 1', true, 0.90, 5, 'admin'),
  ('moderate-content', 'Content Moderation', 'governance',
    'Re-moderate reviews stuck pending; fail-open safety net, <=25/run (WEB-AUTO-009).', '*/15 * * * *', true, 0.85, 10, 'admin'),
  ('weekly-digest', 'Weekly Digest Assembler', 'nurture',
    'Auto-assemble + schedule the weekly digest email; validation-gated (WEB-AUTO-008).', '0 14 * * 2', true, 0.85, 5, 'admin'),
  ('ai-article-pipeline', 'AI Article Pipeline', 'nurture',
    'Daily local-SEO article: topic -> draft -> score -> publish (>=80) / review / discard; cap 1/day (WEB-AUTO-007).', '0 11 * * *', true, 0.80, 30, 'admin'),
  ('social-media-manager', 'Social Media Manager', 'nurture',
    'Generate + publish scheduled social posts across channels.', '0,15,30 * * * *', true, 0.80, 15, 'admin'),
  ('sitemap-refresh', 'Sitemap Refresh', 'maintain',
    'Regenerate/submit sitemaps from the change queue (WEB-AUTO-011).', '0 5 * * *', true, 0.95, NULL, 'admin'),
  ('validate-source-urls', 'Source URL Validator', 'maintain',
    'Weekly broken-URL detection + auto-repair (re-discover, Wayback, flag) (WEB-AUTO-004).', '0 4 * * 0', true, 0.85, 5, 'admin'),
  ('job-health-watchdog', 'Job Health Watchdog', 'governance',
    'Alert on missed/failed observed automation jobs (WEB-AUTO-001).', '0 8 * * *', true, 0.95, NULL, 'admin'),
  -- (b) AOS program agents (introduced by this initiative; disabled until built)
  ('dev-agent', 'Autonomous Dev Agent', 'dev',
    'Proposes + opens small maintenance PRs (dependency bumps, lint/type fixes) for human review (AOS-DEV).', NULL, false, 0.90, 25, 'root_admin'),
  ('maintenance-agent', 'Maintenance Agent', 'maintain',
    'Housekeeping sweeps beyond data-quality-heal (orphan cleanup, cache warmups) (AOS-MAINT).', NULL, false, 0.85, 10, 'admin'),
  ('nurture-agent', 'Lead Nurture Agent', 'nurture',
    'Lifecycle + re-engagement messaging to subscribers/leads (AOS-NURTURE).', NULL, false, 0.80, 20, 'admin'),
  ('prospect-agent', 'Prospecting Agent', 'prospect',
    'Discover + qualify new business/advertiser prospects (AOS-PROSPECT).', NULL, false, 0.75, 30, 'admin'),
  ('support-agent', 'Customer Support Agent', 'support',
    'Answer + triage inbound support requests; escalate tier-2/3 to humans (AOS-CS).', NULL, false, 0.85, 25, 'admin'),
  ('account-manager-agent', 'Account Manager Agent', 'manage',
    'Manage advertiser/partner accounts, renewals and campaign health (AOS-MANAGE).', NULL, false, 0.85, 15, 'admin'),
  ('security-agent', 'Security Monitor Agent', 'security',
    'Watch security signals, triage anomalies, escalate incidents (AOS-SEC).', NULL, false, 0.95, 10, 'root_admin'),
  ('governance-agent', 'Governance Auditor Agent', 'governance',
    'Audit agent behavior against policy + budgets; flag violations (AOS-GOV).', NULL, false, 0.95, 5, 'root_admin')
ON CONFLICT (agent_key) DO NOTHING;
