-- WEB-AUTO-008: Auto-assembled recurring weekly digest with zero-touch sends.
--
-- Additive only: one new nullable/defaulted column on newsletter_campaigns
-- (campaign_type, to distinguish + de-dupe the automated digest), one seed row
-- in system_settings (the pause flag), and a new weekly pg_cron job. No drops,
-- no renames, no tightening — safe for live web + iOS/Android readers (old
-- clients simply ignore the new column).
--
-- The assembled digest is created as a status='scheduled' newsletter_campaigns
-- row with scheduled_for=now(), so the EXISTING dispatch-scheduled-newsletters
-- worker (migration 20260520000012, runs every minute) sends it — unsubscribe,
-- CAN-SPAM compliance, delivery tracking, and bounce/complaint webhooks all
-- behave identically to a human-composed campaign.

-- 1. Provenance column on newsletter_campaigns ------------------------------
ALTER TABLE public.newsletter_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.newsletter_campaigns.campaign_type IS
  'WEB-AUTO-008: ''manual'' for human-composed campaigns, ''weekly_digest'' for the auto-assembled recurring digest. Used to de-dupe the once-per-week digest and surface it in the admin UI.';

-- Cheap lookup for the "already assembled a digest this week?" idempotency
-- guard and for admin filtering.
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_type_created
  ON public.newsletter_campaigns (campaign_type, created_at DESC);

-- 2. Pause flag (single DB config row, admin-toggleable, no code change) -----
-- system_settings is admin-only RLS FOR ALL; service_role (the assembler) bypasses RLS.
INSERT INTO public.system_settings (setting_type, settings)
SELECT 'weekly_digest', jsonb_build_object('paused', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_type = 'weekly_digest'
);

-- 3. Weekly schedule --------------------------------------------------------
-- Tuesday 15:00 UTC (~9-10am America/Chicago, covers CDT and CST). Routes
-- through the WEB-AUTO-001 jobRunner (Job Health panel + failure alerts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('weekly-digest-assemble')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-digest-assemble');

    PERFORM cron.schedule(
      'weekly-digest-assemble',
      '0 15 * * 2',  -- Tuesdays 15:00 UTC (~9-10am Central)
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/assemble-weekly-digest',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('manual', false)
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
