-- WEB-AUTO-010: campaign creative auto-review result columns.
--
-- Additive only (CLAUDE.md backward-compat). The existing is_approved boolean
-- stays the authoritative gate that get_active_ads reads (untouched — iOS/web
-- ad serving are unaffected). These columns only RECORD the automated review's
-- machine-readable result so AdminCampaigns can show why a creative is pending.
--
--   auto_review_status:
--     NULL     legacy / never auto-reviewed (existing rows; old behavior)
--     pending  awaiting (or skipped because the pipeline is paused) — manual review
--     passed   all checks cleared -> the function set is_approved = true
--     failed   a deterministic check failed -> stays pending, reasons populated
--     error    a check could not be evaluated (e.g. AI down) -> stays pending,
--              surfaced for a human (fail-SAFE: uncertainty never auto-approves)

ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS auto_review_status   text,
  ADD COLUMN IF NOT EXISTS auto_review_reasons  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_review_checks   jsonb,
  ADD COLUMN IF NOT EXISTS auto_reviewed_at     timestamptz;

COMMENT ON COLUMN public.campaign_creatives.auto_review_status IS
  'WEB-AUTO-010 automated-review verdict: NULL (legacy) | pending | passed | failed | error. '
  'is_approved remains the public-serving gate; passed sets is_approved=true.';
COMMENT ON COLUMN public.campaign_creatives.auto_review_reasons IS
  'WEB-AUTO-010 machine-readable failure reasons (jsonb array of strings) shown in AdminCampaigns.';
COMMENT ON COLUMN public.campaign_creatives.auto_review_checks IS
  'WEB-AUTO-010 per-check audit detail (image / target_url / brand_safety / advertiser_standing).';

-- The review queue / sweep only ever scans the small set of not-yet-passed rows.
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_autoreview
  ON public.campaign_creatives (auto_review_status)
  WHERE auto_review_status IS NOT NULL AND auto_review_status <> 'passed';
