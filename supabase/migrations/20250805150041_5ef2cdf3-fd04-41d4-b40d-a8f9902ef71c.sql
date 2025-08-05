-- Add nightly cron job to backfill missing coordinates
-- This will run every night at 2 AM to update any NULL latitude/longitude fields

SELECT cron.schedule(
  'nightly-coordinate-backfill',
  '0 2 * * *', -- Every day at 2 AM
  $$
  SELECT net.http_post(
    url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/backfill-all-coordinates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'trigger_source', 'cron',
      'scheduled_at', now()
    )::text
  );
  $$
);

-- Log the cron job creation
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('Created nightly coordinate backfill cron job (runs at 2 AM daily)', NOW());