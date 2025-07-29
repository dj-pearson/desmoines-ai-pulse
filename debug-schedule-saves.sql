-- DEBUG: Check if schedule changes are being saved to database
-- Run this to see what's happening with your schedule updates

-- Show current jobs and their update timestamps
SELECT 'CURRENT JOBS AND TIMESTAMPS:' as check_type;
SELECT 
  id,
  name,
  status,
  config->>'schedule' as current_schedule,
  CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    WHEN config->>'schedule' = '0 */3 * * *' THEN 'Every 3 hours'
    WHEN config->>'schedule' = '0 */8 * * *' THEN 'Every 8 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 */4 * * *' THEN 'Every 4 hours'
    WHEN config->>'schedule' = '0 */2 * * *' THEN 'Every 2 hours'
    WHEN config->>'schedule' = '0 */1 * * *' THEN 'Every hour'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    ELSE 'Custom: ' || (config->>'schedule')
  END as friendly_schedule,
  (config->>'isActive')::boolean as is_active,
  created_at,
  updated_at,
  last_run,
  next_run,
  CASE 
    WHEN updated_at > COALESCE(last_run, '1970-01-01'::timestamptz) THEN '🔄 CONFIG CHANGED AFTER LAST RUN'
    ELSE '✅ No changes since last run'
  END as change_status
FROM public.scraping_jobs
ORDER BY updated_at DESC;

-- Show which jobs need schedule updates
SELECT 'JOBS NEEDING SCHEDULE UPDATES:' as check_type;
SELECT 
  name,
  config->>'schedule' as schedule,
  updated_at,
  last_run,
  next_run,
  EXTRACT(EPOCH FROM (updated_at - COALESCE(last_run, '1970-01-01'::timestamptz)))/60 as minutes_since_config_change
FROM public.scraping_jobs
WHERE updated_at > COALESCE(last_run, '1970-01-01'::timestamptz)
ORDER BY updated_at DESC;

-- Test manual config update (simulate what admin interface should do)
SELECT 'TESTING MANUAL CONFIG UPDATE:' as test_type;

-- Update a job's schedule to test the save mechanism
UPDATE public.scraping_jobs 
SET 
  config = jsonb_set(config, '{schedule}', '"0 */4 * * *"'),
  updated_at = NOW()
WHERE name ILIKE '%Catch%' OR name ILIKE '%Google%'
LIMIT 1;

-- Show the result
SELECT 'AFTER MANUAL UPDATE:' as result_type;
SELECT 
  name,
  config->>'schedule' as new_schedule,
  updated_at,
  'Updated just now' as status
FROM public.scraping_jobs
WHERE updated_at >= NOW() - INTERVAL '1 minute'
ORDER BY updated_at DESC;

-- Run the enhanced cron to process schedule changes
SELECT 'RUNNING CRON TO PROCESS CHANGES:' as action;
SELECT run_scraping_jobs_simple();

-- Show final status
SELECT 'FINAL STATUS AFTER CRON:' as final_check;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  updated_at,
  last_run,
  next_run,
  CASE 
    WHEN status = 'scheduled_for_trigger' THEN '🔵 READY FOR MANUAL TRIGGER'
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 SCHEDULED'
  END as current_status
FROM public.scraping_jobs
ORDER BY updated_at DESC;
