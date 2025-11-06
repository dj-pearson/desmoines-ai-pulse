-- Schedule automatic event source URL validation
-- This cron job runs weekly to fix aggregator URLs (catchdesmoines.com, etc.)
-- and replace them with actual event/ticket URLs (StubHub, Ticketmaster, etc.)

-- Schedule validate-source-urls to run weekly on Sundays at 4 AM
SELECT cron.schedule(
  'validate-source-urls-weekly',
  '0 4 * * 0',  -- Every Sunday at 4:00 AM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/validate-source-urls',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'limit', 50,
        'useAI', true
      )
    ) as request_id;
  $$
);

-- Add comment for documentation
COMMENT ON FUNCTION cron.schedule IS 'Schedules validate-source-urls to run weekly, fixing event URLs that point to aggregator sites';

-- Log the scheduled job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "validate-source-urls-weekly" scheduled to run every Sunday at 4:00 AM';
  RAISE NOTICE 'This job replaces aggregator URLs (catchdesmoines.com) with actual event ticket URLs (StubHub, Ticketmaster, etc.)';
END $$;
