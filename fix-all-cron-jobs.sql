-- FIX ALL CRON JOBS - Force update next_run times for all jobs
-- This will fix the remaining jobs that still have old next_run times

-- First, let's see which jobs need fixing
SELECT 'JOBS THAT NEED FIXING:' as check_type;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    WHEN config->>'schedule' = '0 */3 * * *' THEN 'Every 3 hours'
    WHEN config->>'schedule' = '0 */8 * * *' THEN 'Every 8 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 */4 * * *' THEN 'Every 4 hours'
    WHEN config->>'schedule' = '0 */2 * * *' THEN 'Every 2 hours'
    WHEN config->>'schedule' = '0 */1 * * *' THEN 'Every hour'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    WHEN config->>'schedule' = '0 18 * * *' THEN 'Daily at 6 PM'
    ELSE 'Unknown: ' || (config->>'schedule')
  END as friendly_schedule,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE - needs immediate fix'
    WHEN next_run > NOW() + INTERVAL '1 day' THEN '🟡 Too far in future - may need adjustment'
    ELSE '🟢 Reasonable timing'
  END as needs_fix
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run ASC;

-- Force update ALL active jobs to have correct next_run times
SELECT 'FIXING ALL JOBS WITH CORRECT SCHEDULES:' as action;

-- Update jobs with proper next_run calculation
UPDATE public.scraping_jobs 
SET 
  next_run = CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
    WHEN config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
    WHEN config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
    WHEN config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
    WHEN config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
    WHEN config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
    WHEN config->>'schedule' = '0 6 * * *' THEN 
      CASE 
        WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
        ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
      END
    WHEN config->>'schedule' = '0 18 * * *' THEN 
      CASE 
        WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '18 hours'
        ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
      END
    ELSE NOW() + INTERVAL '6 hours' -- Default fallback
  END,
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true;

-- Log this mass update
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔧 MASS UPDATE: Fixed next_run times for all active jobs based on their schedules', NOW());

-- Show results after the fix
SELECT 'AFTER FIXING ALL JOBS:' as result_type;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    WHEN config->>'schedule' = '0 */3 * * *' THEN 'Every 3 hours'
    WHEN config->>'schedule' = '0 */8 * * *' THEN 'Every 8 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 */4 * * *' THEN 'Every 4 hours'
    WHEN config->>'schedule' = '0 */2 * * *' THEN 'Every 2 hours'
    WHEN config->>'schedule' = '0 */1 * * *' THEN 'Every hour'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    WHEN config->>'schedule' = '0 18 * * *' THEN 'Daily at 6 PM'
    ELSE 'Unknown: ' || (config->>'schedule')
  END as friendly_schedule,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE (will be processed by next cron run)'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
    ELSE '🟢 SCHEDULED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
  END as timing_status,
  (config->>'isActive')::boolean as is_active
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Run the enhanced cron to process any jobs that are now overdue
SELECT 'RUNNING CRON TO PROCESS NEWLY OVERDUE JOBS:' as cron_run;
SELECT run_scraping_jobs_simple();

-- Final status check
SELECT 'FINAL STATUS - ALL JOBS SHOULD BE PROPERLY SCHEDULED:' as final_check;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  next_run,
  CASE 
    WHEN status = 'scheduled_for_trigger' THEN '🔵 READY FOR MANUAL TRIGGER'
    WHEN next_run <= NOW() THEN '🔴 STILL OVERDUE - check logs'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON'
    ELSE '🟢 PROPERLY SCHEDULED'
  END as final_status,
  ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) as minutes_until_next_run
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run ASC;

-- Show recent cron logs to verify everything worked
SELECT 'RECENT CRON ACTIVITY:' as logs;
SELECT 
  created_at,
  message,
  job_id,
  CASE 
    WHEN error_details IS NULL THEN '✅ Success'
    ELSE '❌ Error: ' || error_details
  END as result
FROM public.cron_logs 
WHERE created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
