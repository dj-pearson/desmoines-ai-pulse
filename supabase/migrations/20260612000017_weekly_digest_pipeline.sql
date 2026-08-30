-- WEB-AUTO-008: Auto-assembled recurring weekly digest newsletter.
--
-- Additive only (CLAUDE.md backward-compat): a new nullable column on the
-- existing newsletter_campaigns table tags rows the assembler created, plus
-- a feature-flag pause toggle. Existing rows (manual sends) keep
-- campaign_type = NULL and behave exactly as before.

-- Tag auto-assembled campaigns so the assembler can dedupe per week and the
-- admin UI can distinguish them from manual sends. NULL = manual (unchanged).
ALTER TABLE public.newsletter_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT;

COMMENT ON COLUMN public.newsletter_campaigns.campaign_type IS
  'Origin/template of the campaign. NULL = manual admin send; '
  '''weekly_digest'' = auto-assembled by the assemble-weekly-digest job (WEB-AUTO-008).';

-- Supports the once-per-week idempotency lookup (latest weekly_digest row).
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_type_created
  ON public.newsletter_campaigns(campaign_type, created_at DESC)
  WHERE campaign_type IS NOT NULL;

-- Pause toggle for the recurring digest. Seeded enabled so the pipeline runs
-- out of the box; an admin flips this off in the Email admin UI to pause the
-- recurrence with no code change (mirrors ai_article_pipeline_enabled).
INSERT INTO public.feature_flags (flag_key, enabled, description, target_tiers)
VALUES (
  'weekly_digest_enabled',
  true,
  'Auto-assemble and schedule the weekly digest newsletter (WEB-AUTO-008). Turn off to pause the recurrence.',
  ARRAY['admin']
)
ON CONFLICT (flag_key) DO NOTHING;
