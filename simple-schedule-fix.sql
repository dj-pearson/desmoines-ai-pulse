-- SIMPLE FIX: Just fix the scheduling without changing function signatures
-- Run this in Supabase SQL Editor

-- Step 1: First, let's see what's broken
SELECT 
  'CURRENT BROKEN STATE:' as status,
  name,
  status,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE - WILL NEVER RUN'
    ELSE '🟢 OK'
  END as problem_status,
  config->>'schedule' as schedule
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Step 2: Fix the immediate scheduling issue
UPDATE public.scraping_jobs 
SET next_run = CASE 
  -- Set all jobs to run in the next 5-30 minutes with staggered times
  WHEN name LIKE '%Google%' THEN NOW() + INTERVAL '5 minutes'
  WHEN name LIKE '%Catch%' THEN NOW() + INTERVAL '10 minutes'
  WHEN name LIKE '%Iowa Events%' THEN NOW() + INTERVAL '15 minutes'
  WHEN name LIKE '%Vibrant%' THEN NOW() + INTERVAL '20 minutes'
  ELSE NOW() + INTERVAL '25 minutes'
END
WHERE next_run <= NOW() OR next_run IS NULL;

-- Step 3: Ensure all jobs are properly configured
UPDATE public.scraping_jobs 
SET config = config || jsonb_build_object(
  'isActive', true,
  'schedule', COALESCE(config->>'schedule', '0 */6 * * *')
)
WHERE (config->>'isActive') IS NULL OR (config->>'schedule') IS NULL;

-- Step 4: Verify the fix
SELECT 
  'AFTER FIX:' as status,
  name,
  status,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 STILL BROKEN'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
    ELSE '🟢 SCHEDULED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
  END as new_status,
  config->>'schedule' as schedule,
  config->>'isActive' as is_active
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Step 5: Test the cron function manually (this should work with existing function)
SELECT 'TESTING CRON FUNCTION:' as test_status;
SELECT run_scraping_jobs();

-- Step 6: Log this fix
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('URGENT FIX: Reset all job schedules to fix overdue scheduling issue', NOW());

-- Step 7: Show upcoming cron runs
SELECT 'NEXT CRON EXECUTION:' as info;
SELECT 
  'scraping-jobs-runner' as cron_job_name,
  'Every 30 minutes' as frequency,
  EXTRACT(MINUTE FROM NOW()) as current_minute,
  CASE 
    WHEN EXTRACT(MINUTE FROM NOW()) % 30 = 0 THEN 'Running right now!'
    ELSE (30 - (EXTRACT(MINUTE FROM NOW())::int % 30)) || ' minutes until next cron run'
  END as next_cron_info;
