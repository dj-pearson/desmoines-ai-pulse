-- FOCUSED DEBUG: Check Catch Des Moines Events schedule updates
-- This will show exactly what's happening with your Daily schedule change

-- Show the current state of Catch Des Moines Events
SELECT 'CATCH DES MOINES CURRENT STATE:' as info;
SELECT 
  id,
  name,
  status,
  config,
  config->>'schedule' as schedule_cron,
  config->>'isActive' as is_active,
  created_at,
  updated_at,
  last_run,
  next_run,
  CASE 
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    WHEN config->>'schedule' = '0 18 * * *' THEN 'Daily at 6 PM (Evening)'
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    ELSE 'Other: ' || (config->>'schedule')
  END as friendly_schedule
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%'
ORDER BY updated_at DESC;

-- Check if this job needs a schedule update according to our cron logic
SELECT 'SHOULD THIS JOB GET SCHEDULE UPDATE?' as check;
SELECT 
  name,
  updated_at,
  last_run,
  updated_at > COALESCE(last_run, '1970-01-01'::timestamptz) as needs_update,
  EXTRACT(EPOCH FROM (updated_at - COALESCE(last_run, '1970-01-01'::timestamptz)))/60 as minutes_since_change
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%';

-- Manually update Catch Des Moines to Daily Evening schedule
SELECT 'MANUALLY SETTING TO DAILY EVENING:' as action;
UPDATE public.scraping_jobs 
SET 
  config = jsonb_set(config, '{schedule}', '"0 18 * * *"'),
  updated_at = NOW()
WHERE name ILIKE '%Catch%';

-- Show what the next_run SHOULD be for Daily Evening (6 PM)
SELECT 'CALCULATING CORRECT NEXT_RUN FOR DAILY 6PM:' as calculation;
SELECT 
  NOW() as current_time,
  EXTRACT(HOUR FROM NOW()) as current_hour,
  CASE 
    WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN 
      DATE_TRUNC('day', NOW()) + INTERVAL '18 hours'
    ELSE 
      DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
  END as calculated_next_run,
  '0 18 * * *' as daily_evening_cron;

-- Test the enhanced cron function on this specific job
SELECT 'TESTING ENHANCED CRON ON UPDATED JOB:' as test;
SELECT run_scraping_jobs_simple();

-- Show the result after cron processing
SELECT 'AFTER CRON PROCESSING:' as result;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  updated_at,
  last_run,
  next_run,
  CASE 
    WHEN next_run > NOW() + INTERVAL '12 hours' THEN '🟢 Correctly scheduled for tomorrow'
    WHEN next_run <= NOW() THEN '🔴 Still overdue - problem!'
    ELSE '🟡 Scheduled soon'
  END as next_run_status
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%';

-- Show recent cron logs for this job
SELECT 'RECENT CRON LOGS FOR CATCH DES MOINES:' as logs;
SELECT 
  created_at,
  message,
  error_details
FROM public.cron_logs
WHERE message ILIKE '%Catch%' 
   OR job_id = (SELECT id FROM public.scraping_jobs WHERE name ILIKE '%Catch%' LIMIT 1)
ORDER BY created_at DESC
LIMIT 5;
