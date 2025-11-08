-- Schedule automatic coordinate backfill for events and restaurants
-- This ensures all venues and locations have accurate lat/lng coordinates

-- Schedule backfill-all-coordinates to run nightly at 4:30 AM
-- This function already exists and handles both events and restaurants
SELECT cron.schedule(
  'backfill-coordinates-nightly',
  '30 4 * * *',  -- Every day at 4:30 AM
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/backfill-all-coordinates',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
        'Content-Type', 'application/json'
      )
    ) as request_id;
  $$
);

-- Add comment for documentation
DO $$
BEGIN
  RAISE NOTICE 'Cron job "backfill-coordinates-nightly" scheduled to run daily at 4:30 AM';
  RAISE NOTICE 'This job fills in missing latitude/longitude coordinates for all events and restaurants';
  RAISE NOTICE 'Uses Google Geocoding API to convert addresses to coordinates';
END $$;
