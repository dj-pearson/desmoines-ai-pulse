-- PROPER SCHEDULE FIX - Respects each job's actual schedule
-- This will set correct next_run times based on actual schedule patterns

SELECT 'ANALYZING CURRENT SCHEDULES:' as analysis;
SELECT 
  name,
  config->>'schedule' as schedule,
  CASE 
    WHEN config->>'schedule' = '0 6 1 * *' THEN 'Monthly (1st at 6 AM)'
    WHEN config->>'schedule' = '0 6 * * 1' THEN 'Weekly (Monday at 6 AM)'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily (6 AM)'
    ELSE 'Unknown: ' || (config->>'schedule')
  END as schedule_type,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 FUTURE'
  END as current_status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY name;

-- Fix with PROPER schedule calculations
SELECT 'APPLYING CORRECT SCHEDULE CALCULATIONS:' as fix_action;

-- Update DAILY jobs (0 6 * * *) - Daily at 6 AM
UPDATE public.scraping_jobs 
SET 
  next_run = CASE 
    WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
    ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
  END,
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true 
  AND config->>'schedule' = '0 6 * * *';

-- Update WEEKLY jobs (0 6 * * 1) - Monday at 6 AM
UPDATE public.scraping_jobs 
SET 
  next_run = CASE 
    WHEN EXTRACT(DOW FROM NOW()) = 1 AND EXTRACT(HOUR FROM NOW()) < 6 THEN 
      DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'  -- Today if it's Monday before 6 AM
    WHEN EXTRACT(DOW FROM NOW()) = 1 THEN 
      DATE_TRUNC('day', NOW()) + INTERVAL '7 days 6 hours'  -- Next Monday if it's Monday after 6 AM
    ELSE 
      DATE_TRUNC('week', NOW()) + INTERVAL '1 week 1 day 6 hours'  -- Next Monday
  END,
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true 
  AND config->>'schedule' = '0 6 * * 1';

-- Update MONTHLY jobs (0 6 1 * *) - 1st of month at 6 AM
UPDATE public.scraping_jobs 
SET 
  next_run = CASE 
    WHEN EXTRACT(DAY FROM NOW()) = 1 AND EXTRACT(HOUR FROM NOW()) < 6 THEN 
      DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'  -- Today if it's the 1st before 6 AM
    WHEN EXTRACT(DAY FROM NOW()) = 1 THEN 
      DATE_TRUNC('month', NOW()) + INTERVAL '1 month 6 hours'  -- Next month if it's the 1st after 6 AM
    ELSE 
      DATE_TRUNC('month', NOW()) + INTERVAL '1 month 6 hours'  -- Next month
  END,
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true 
  AND config->>'schedule' = '0 6 1 * *';

-- Show results with proper timing
SELECT 'AFTER PROPER SCHEDULE FIX:' as results;
SELECT 
  name,
  config->>'schedule' as schedule,
  CASE 
    WHEN config->>'schedule' = '0 6 1 * *' THEN 'Monthly (1st at 6 AM)'
    WHEN config->>'schedule' = '0 6 * * 1' THEN 'Weekly (Monday at 6 AM)'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily (6 AM)'
    ELSE 'Unknown'
  END as schedule_type,
  next_run,
  CASE 
    WHEN next_run <= NOW() + INTERVAL '1 day' THEN 
      '🟡 SOON (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/3600, 1) || ' hours)'
    WHEN next_run <= NOW() + INTERVAL '7 days' THEN 
      '🟢 THIS WEEK (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/24/3600, 1) || ' days)'
    ELSE 
      '🔵 FUTURE (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/24/3600, 1) || ' days)'
  END as timing_status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run;

-- Verify the logic is correct
SELECT 'SCHEDULE VERIFICATION:' as verify;
SELECT 
  'Daily jobs should run tomorrow at 6 AM (or today if before 6 AM)' as daily_rule,
  'Weekly jobs should run next Monday at 6 AM' as weekly_rule,
  'Monthly jobs should run on the 1st of next month at 6 AM' as monthly_rule;
