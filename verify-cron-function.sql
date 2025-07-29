-- VERIFY CRON FUNCTION RESULTS
-- Run this to see if the safe function replacement worked

-- Check if any jobs were processed
SELECT 'RECENT CRON ACTIVITY:' as check_type;
SELECT 
  created_at,
  message,
  job_id,
  error_details,
  CASE 
    WHEN error_details IS NULL THEN '✅ Success'
    ELSE '❌ Error'
  END as result
FROM public.cron_logs 
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- Check current job schedules
SELECT 'CURRENT JOB STATUS:' as check_type;
SELECT 
  name,
  status,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE (should run now)'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
    ELSE '🟢 SCHEDULED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
  END as status_info,
  config->>'schedule' as schedule,
  config->>'isActive' as is_active
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- If no jobs were due, let's manually trigger one for testing
SELECT 'MANUAL TRIGGER TEST:' as test_type;

-- First, set one job to be due right now for testing
UPDATE public.scraping_jobs 
SET next_run = NOW() - INTERVAL '1 minute'
WHERE name = 'Google Events - Des Moines'
LIMIT 1;

-- Now run the cron function again to process the overdue job
SELECT run_scraping_jobs();

-- Check the results again
SELECT 'AFTER MANUAL TRIGGER:' as check_type;
SELECT 
  created_at,
  message,
  job_id,
  error_details
FROM public.cron_logs 
WHERE created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 5;
