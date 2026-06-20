-- WEB-AUTO-010: campaign creative auto-review.
--
-- Additive columns capture the machine-readable auto-review result alongside the
-- existing is_approved / rejection_reason flow (which admins still control both
-- ways). An AFTER INSERT trigger enqueues the review via pg_net (service-role),
-- and a sweep cron catches any creatives that stay unreviewed. get_active_ads
-- and the campaigns/advertisements shapes are untouched (iOS reads them).

ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS auto_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS auto_review_reasons text[];
ALTER TABLE public.campaign_creatives
  ADD COLUMN IF NOT EXISTS auto_review_checks jsonb;

-- Enqueue auto-review on insert (best-effort; never blocks creative upload).
CREATE OR REPLACE FUNCTION public.enqueue_creative_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/campaign-creative-review',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'db-trigger'
        ),
        body := jsonb_build_object('creativeId', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- a missed enqueue is covered by the sweep below
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creative_review ON public.campaign_creatives;
CREATE TRIGGER trg_creative_review
  AFTER INSERT ON public.campaign_creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_creative_review();

-- Sweep: review any creatives that never got auto-reviewed. Every 10 minutes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('campaign-creative-review-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-creative-review-sweep');

    PERFORM cron.schedule(
      'campaign-creative-review-sweep',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/campaign-creative-review',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('mode', 'sweep')
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
