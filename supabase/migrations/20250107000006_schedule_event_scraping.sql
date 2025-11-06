-- Schedule automatic event scraping and enhancement
-- Keeps event database fresh with latest events from partner sites

-- Schedule event scraping twice daily (6 AM and 6 PM)
-- This uses the existing scrape-events function that handles multiple sources
SELECT cron.schedule(
  'scrape-events-morning',
  '0 6 * * *',  -- Every day at 6:00 AM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scrape-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json',
        'x-trigger-source', 'cron-auto'
      )
    ) as request_id;
  $$
);

SELECT cron.schedule(
  'scrape-events-evening',
  '0 18 * * *',  -- Every day at 6:00 PM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/scrape-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json',
        'x-trigger-source', 'cron-auto'
      )
    ) as request_id;
  $$
);

-- Schedule event enhancement to run 30 minutes after each scrape
-- This uses the existing batch-enhance-events function with AI descriptions
SELECT cron.schedule(
  'enhance-events-morning',
  '30 6 * * *',  -- Every day at 6:30 AM (30 min after morning scrape)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/batch-enhance-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'limit', 50,
        'forceRefresh', false
      )
    ) as request_id;
  $$
);

SELECT cron.schedule(
  'enhance-events-evening',
  '30 18 * * *',  -- Every day at 6:30 PM (30 min after evening scrape)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/batch-enhance-events',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'limit', 50,
        'forceRefresh', false
      )
    ) as request_id;
  $$
);

-- Log the scheduled jobs
DO $$
BEGIN
  RAISE NOTICE '✅ Cron job "scrape-events-morning" scheduled to run daily at 6:00 AM';
  RAISE NOTICE '✅ Cron job "scrape-events-evening" scheduled to run daily at 6:00 PM';
  RAISE NOTICE '✅ Cron job "enhance-events-morning" scheduled to run daily at 6:30 AM';
  RAISE NOTICE '✅ Cron job "enhance-events-evening" scheduled to run daily at 6:30 PM';
  RAISE NOTICE '';
  RAISE NOTICE 'Event Pipeline Workflow:';
  RAISE NOTICE '1. Scrape new events from partner sites (6 AM & 6 PM)';
  RAISE NOTICE '2. Wait 30 minutes for scraping to complete';
  RAISE NOTICE '3. Enhance events with AI-generated descriptions (6:30 AM & 6:30 PM)';
  RAISE NOTICE '4. Events appear on site with rich, engaging content';
END $$;
