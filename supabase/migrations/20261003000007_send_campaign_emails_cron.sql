-- Email the campaign notices the database writes (NON_CORE_REVIEW_2026-09).
--
-- process_campaign_lifecycle and admin_set_campaign_status insert
-- campaign_notifications rows with email_pending = true (20261003000003,
-- 20261003000005). send-campaign-emails claims each row, mails it through
-- _shared/email.ts and stamps emailed_at. Every 15 minutes, so an admin's
-- pause or cancel reaches the advertiser within the quarter hour and the
-- 06:10 UTC lifecycle run's notices go out by 06:15.
--
-- Credentials from Vault via public.app_secret(), as 20260831000001 does and
-- for the reason 20260826000002 records. Idempotent; a no-op without pg_cron.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping send-campaign-emails schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-campaign-emails') THEN
    PERFORM cron.unschedule('send-campaign-emails');
  END IF;

  PERFORM cron.schedule(
    'send-campaign-emails',
    '*/15 * * * *',
    $cron$
    DO $inner$
    DECLARE
      v_url text := public.app_secret('supabase_url');
      v_key text := public.app_secret('service_role_key');
    BEGIN
      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE EXCEPTION 'send-campaign-emails not run: vault secret supabase_url or service_role_key is missing';
      END IF;
      -- Skip the POST when there is nothing to send, so 96 runs a day cost
      -- one indexed probe each (idx_campaign_notifications_email_pending).
      IF EXISTS (SELECT 1 FROM public.campaign_notifications WHERE email_pending IS TRUE) THEN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/send-campaign-emails',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
                       'Authorization', 'Bearer ' || v_key,
                       'Content-Type', 'application/json'
                     )
        );
      END IF;
    END
    $inner$;
    $cron$
  );
END
$$;
