-- IMMEDIATE FIX: Reset All Job Schedules to Future Times
-- Run this RIGHT NOW in Supabase SQL Editor to fix the scheduling issue

-- Step 1: See current broken state
SELECT 
  'BEFORE FIX - Current Status:' as status,
  name,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 BROKEN - Will never run'
    ELSE '🟢 OK'
  END as problem_status,
  config->>'schedule' as schedule
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Step 2: Fix all jobs to have future next_run times
UPDATE public.scraping_jobs 
SET next_run = NOW() + INTERVAL '15 minutes'  -- Schedule all jobs to run in 15 minutes
WHERE next_run <= NOW() OR next_run IS NULL;

-- Step 3: Verify the fix
SELECT 
  'AFTER FIX - Fixed Status:' as status,
  name,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 STILL BROKEN'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON'
    ELSE '🟢 PROPERLY SCHEDULED'
  END as new_status,
  ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) as minutes_until_run,
  config->>'schedule' as schedule
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Step 4: Log this fix
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('Manual fix applied: Reset all overdue job schedules to run in 15 minutes', NOW());
