-- WEB-AUTO-002: AI triage fields for event submissions (additive).

ALTER TABLE public.user_submitted_events
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS triage_reasons JSONB,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_decided BOOLEAN NOT NULL DEFAULT false;

-- Provenance flag on events so auto-approved user submissions are
-- distinguishable from scraped/admin content. Nullable + additive: existing
-- readers (web + mobile) ignore the new column.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN public.user_submitted_events.quality_score IS 'WEB-AUTO-002 AI triage score 0-100.';
COMMENT ON COLUMN public.user_submitted_events.triage_reasons IS 'WEB-AUTO-002 AI triage reasons[].';
COMMENT ON COLUMN public.user_submitted_events.auto_decided IS 'WEB-AUTO-002 true when approved/rejected by the AI triage, not a human.';
COMMENT ON COLUMN public.events.source IS 'Provenance, e.g. user_submission, scraper, admin.';
