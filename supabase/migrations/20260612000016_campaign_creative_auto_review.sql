-- WEB-AUTO-010: Campaign creative auto-review (spec + quality + brand-safety checks).
--
-- Additive only: new nullable/defaulted columns on campaign_creatives + a daily
-- safety-net sweep cron. No drops/renames/tightening. The review-campaign-creative
-- edge function runs spec/quality/brand-safety/standing checks and, when ALL pass,
-- sets is_approved=true automatically (the same field a human admin sets); any
-- failure leaves the creative pending with machine-readable reasons for the admin.
-- get_active_ads / serving behavior is unchanged (iOS reads it): an auto-approved
-- creative is byte-for-byte identical to a human-approved one.

-- 1. Machine-readable auto-review state on each creative ---------------------
ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS auto_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_review_status text,
  ADD COLUMN IF NOT EXISTS auto_review_reasons text[],
  ADD COLUMN IF NOT EXISTS auto_review_checks jsonb,
  ADD COLUMN IF NOT EXISTS auto_review_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.campaign_creatives.auto_review_status IS
  'WEB-AUTO-010: NULL (not yet auto-reviewed) | approved (all checks passed, is_approved set automatically) | failed (a check failed, held for the human admin). auto_reviewed_at is the idempotency marker.';
COMMENT ON COLUMN public.campaign_creatives.auto_review_checks IS
  'WEB-AUTO-010: per-check pass/fail results {good_standing,image,dimensions,url,brand_safety} for the AdminCampaigns failure-reason display.';

-- Index only the slice that still needs an automated pass (not yet reviewed and
-- not human-approved). Cheap and tiny.
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_auto_review
  ON public.campaign_creatives (created_at)
  WHERE auto_reviewed_at IS NULL AND is_approved IS NOT TRUE;

-- 2. Daily safety-net sweep -------------------------------------------------
-- PRIMARY path is real-time: CreativeUploadForm fires review-campaign-creative
-- per new creative. This cron only catches creatives whose real-time call did
-- not complete (auto_reviewed_at still NULL), re-reviews them, drains any manual
-- backlog, and gives Job Health observability. Cheap when nothing is pending and
-- routes through the WEB-AUTO-001 jobRunner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('campaign-creative-review-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-creative-review-sweep');

    PERFORM cron.schedule(
      'campaign-creative-review-sweep',
      '35 * * * *',  -- hourly at :35
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/review-campaign-creative',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('action', 'sweep', 'manual', false)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
