-- Schedule cron job to auto-generate recurring event instances
-- Runs daily at 2 AM Central Time (8:00 UTC)

-- Schedule the recurring events instance generation job
-- Cron format: minute hour day-of-month month day-of-week
-- '0 8 * * *' = Every day at 08:00 UTC (2:00 AM Central Time)
SELECT cron.schedule(
  'generate-recurring-event-instances',
  '0 8 * * *',
  $$
  SELECT regenerate_all_recurring_instances();
  $$
);

-- Add comment for documentation
COMMENT ON EXTENSION pg_cron IS 'Job scheduler - Used for weekly digest emails and recurring event generation';

-- Log the cron job creation
DO $$
BEGIN
  RAISE NOTICE 'Recurring events cron job scheduled: Every day at 2:00 AM Central Time (8:00 UTC)';
  RAISE NOTICE 'This job will auto-generate instances for all recurring events looking 90 days forward';
END $$;
