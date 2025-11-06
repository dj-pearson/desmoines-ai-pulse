-- Schedule automatic event source URL validation
-- This cron job runs weekly to fix aggregator URLs (catchdesmoines.com, etc.)
-- and replace them with actual event/ticket URLs (StubHub, Ticketmaster, etc.)
-- Note: pg_cron extension is pre-installed in Supabase and managed at platform level

-- First, unschedule any existing job with the same name
SELECT cron.unschedule('validate-source-urls-weekly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'validate-source-urls-weekly'
);

-- Schedule validate-source-urls to run weekly on Sundays at 4 AM
SELECT cron.schedule(
  'validate-source-urls-weekly',
  '0 4 * * 0',  -- Every Sunday at 4:00 AM
  $$
  SELECT
    net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/validate-source-urls',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'limit', 50,
        'useAI', true
      )::text
    ) as request_id;
  $$
);

-- Log the scheduled job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "validate-source-urls-weekly" scheduled to run every Sunday at 4:00 AM';
  RAISE NOTICE 'This job replaces aggregator URLs (catchdesmoines.com) with actual event ticket URLs (StubHub, Ticketmaster, etc.)';
  RAISE NOTICE 'Note: pg_cron extension is managed by Supabase platform';
END $$;
