-- WEB-AUTO-010: campaign creative auto-review trigger + sweep + pause flag.
--
-- A creative is inserted by the advertiser's browser (CreativeUploadForm) with
-- is_approved=false. We want automated checks to run "on insert" without the
-- browser having to call an auth-gated AI/SSRF-capable function directly, so an
-- AFTER INSERT trigger enqueues the review server-side via pg_net with the
-- service-role bearer (same pattern as enqueue_contact_moderation, WEB-AUTO-009).
-- The sweep below is the fail-safe for any creative left pending/error.

-- ---------------------------------------------------------------------------
-- Enqueue auto-review on insert (best-effort; never blocks the upload).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_creative_autoreview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only review creatives that aren't already approved (don't churn admin
  -- decisions or re-review historical rows).
  IF NEW.is_approved IS TRUE THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/review-campaign-creative',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'db-trigger'
        ),
        body := jsonb_build_object('creativeId', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Auto-review enqueue must never break creative intake. A missed enqueue is
    -- covered by the row staying pending (admin can review) and the sweep cron.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creative_autoreview ON public.campaign_creatives;
CREATE TRIGGER trg_creative_autoreview
  AFTER INSERT ON public.campaign_creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_creative_autoreview();

-- ---------------------------------------------------------------------------
-- Pause toggle (mirrors content_moderation_enabled / ai_article_pipeline_enabled).
-- Seeded enabled so auto-review runs out of the box. When OFF the function
-- leaves creatives pending for manual review (a creative GATE must NEVER
-- trust-through to auto-approve unreviewed ads — fail to the safe manual path).
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (flag_key, enabled, description, target_tiers)
VALUES (
  'campaign_creative_autoreview_enabled',
  true,
  'Automated review of advertiser ad creatives — image spec, target URL, brand safety, advertiser standing (WEB-AUTO-010). Turn off to fall back to fully manual review.',
  ARRAY['admin']
)
ON CONFLICT (flag_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sweep: re-review any creative stuck in 'pending'/'error' (e.g. the trigger
-- enqueue failed or the AI was down). Every 30 minutes; the edge function
-- bounds the batch.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('review-creative-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-creative-sweep');

    PERFORM cron.schedule(
      'review-creative-sweep',
      '*/30 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/review-campaign-creative',
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
