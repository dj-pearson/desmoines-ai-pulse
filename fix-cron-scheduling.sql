-- Fix Cron Job Next Run Times
-- Run this in Supabase SQL Editor to fix the scheduling issue

-- First, let's see what the current schedule values are
SELECT 
  name,
  status,
  last_run,
  next_run,
  config->>'schedule' as schedule,
  config->>'isActive' as is_active,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE - WILL NEVER RUN'
    ELSE '🟢 OK'
  END as scheduling_status
FROM public.scraping_jobs;

-- Fix all next_run times to be in the future
UPDATE public.scraping_jobs 
SET next_run = CASE 
  -- If schedule is defined, use appropriate interval
  WHEN config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '1 hour'  -- Next hour for 6-hour jobs
  WHEN config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '30 minutes'  -- 30 min for 3-hour jobs
  WHEN config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '2 hours'  -- 2 hours for 8-hour jobs
  WHEN config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '3 hours'  -- 3 hours for 12-hour jobs
  WHEN config->>'schedule' = '0 6 * * *' THEN 
    -- For daily jobs, schedule for tomorrow at 6 AM if it's after 6 AM today
    CASE 
      WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
      ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
    END
  -- Default case: schedule for next hour regardless of original schedule
  ELSE NOW() + INTERVAL '1 hour'
END,
-- Also ensure all jobs are marked as active
config = config || jsonb_build_object('isActive', true)
WHERE next_run <= NOW() OR next_run IS NULL;

-- Update jobs with no schedule to default 6-hour interval
UPDATE public.scraping_jobs 
SET config = config || jsonb_build_object(
  'schedule', '0 */6 * * *',
  'isActive', true
)
WHERE config->>'schedule' IS NULL OR config->>'schedule' = '';

-- Verify the fix worked
SELECT 
  'After Fix:' as status,
  name,
  status,
  last_run,
  next_run,
  config->>'schedule' as schedule,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 STILL OVERDUE'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON'
    ELSE '🟢 PROPERLY SCHEDULED'
  END as new_status,
  EXTRACT(EPOCH FROM (next_run - NOW()))/60 as minutes_until_next_run
FROM public.scraping_jobs
ORDER BY next_run ASC;
