-- Add cron job to send event reminders hourly
-- Requires pg_cron extension

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to send event reminders every hour
-- Runs at the top of every hour
SELECT cron.schedule(
  'send-event-reminders-hourly',  -- Job name
  '0 * * * *',                      -- Cron expression: every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-event-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Alternative: Call the RPC function directly and process reminders
-- This approach doesn't require the edge function to be deployed
-- Uncomment if you prefer serverless cron without edge functions

/*
SELECT cron.schedule(
  'process-event-reminders-direct',
  '0 * * * *',  -- Every hour
  $$
  DO $$
  DECLARE
    reminder_record RECORD;
  BEGIN
    -- Get pending reminders
    FOR reminder_record IN
      SELECT * FROM get_pending_reminders()
    LOOP
      -- Here you would call your email service
      -- For now, just mark as sent (you'll need to integrate with email service)
      PERFORM mark_reminder_sent(reminder_record.reminder_id, 'sent');

      -- Log the action
      RAISE NOTICE 'Processed reminder % for event % to %',
        reminder_record.reminder_id,
        reminder_record.event_title,
        reminder_record.user_email;
    END LOOP;
  END $$;
  $$
);
*/

-- Function to check cron job status
CREATE OR REPLACE FUNCTION check_reminder_cron_status()
RETURNS TABLE (
  jobid BIGINT,
  schedule TEXT,
  command TEXT,
  nodename TEXT,
  nodeport INTEGER,
  database TEXT,
  username TEXT,
  active BOOLEAN,
  jobname TEXT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT * FROM cron.job WHERE jobname LIKE '%reminder%';
$$;

-- Grant execute to authenticated users (admins only in practice)
GRANT EXECUTE ON FUNCTION check_reminder_cron_status() TO authenticated;

COMMENT ON FUNCTION check_reminder_cron_status IS
'Check the status of the event reminder cron job. Admin use only.';
