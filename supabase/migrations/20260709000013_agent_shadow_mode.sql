-- AOS-GOV-005: shadow / dry-run mode per agent. A new agent runs in shadow
-- (proposes + logs actions without executing) until an operator flips it live.
-- Additive only.

DO $$ BEGIN
  CREATE TYPE agent_mode AS ENUM ('shadow', 'live');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Default shadow: every NEW agent ships in shadow mode until promoted.
ALTER TABLE public.agent_registry
  ADD COLUMN IF NOT EXISTS mode agent_mode NOT NULL DEFAULT 'shadow';

COMMENT ON COLUMN public.agent_registry.mode IS
  'shadow = compute + log proposed actions without executing; live = execute (AOS-GOV-005).';

-- Flag shadow proposals in the immutable audit trail.
ALTER TABLE public.agent_audit_log
  ADD COLUMN IF NOT EXISTS shadow BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_audit_shadow ON public.agent_audit_log (shadow) WHERE shadow = true;

-- The WEB-AUTO jobs + control-plane agents already run in production — promote
-- them to live. The AOS program agents (dev/maintenance/nurture/prospect/
-- support/account-manager/security/governance) stay shadow (the column default).
UPDATE public.agent_registry SET mode = 'live'
WHERE agent_key IN (
  'content-ingest', 'data-quality-heal', 'backfill-images', 'dedupe-content',
  'moderate-content', 'weekly-digest', 'ai-article-pipeline', 'social-media-manager',
  'sitemap-refresh', 'validate-source-urls', 'job-health-watchdog',
  'escalation-router', 'approval-sweeper', 'ops-digest'
);
