-- DIAGNOSTIC: Find out what's really in the database
-- This will show us the actual schedule values so we can fix them properly

SELECT 'ACTUAL SCHEDULES IN DATABASE:' as info;
SELECT 
  name,
  config->>'schedule' as actual_schedule,
  config->>'isActive' as is_active,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 FUTURE'
  END as timing
FROM public.scraping_jobs
ORDER BY name;

-- Show unique schedule patterns
SELECT 'UNIQUE SCHEDULE PATTERNS:' as patterns;
SELECT 
  config->>'schedule' as schedule_pattern,
  COUNT(*) as job_count,
  STRING_AGG(name, ', ') as job_names
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
GROUP BY config->>'schedule'
ORDER BY COUNT(*) DESC;

-- Force update ALL active jobs regardless of schedule
SELECT 'FORCE UPDATING ALL ACTIVE JOBS:' as force_update;
UPDATE public.scraping_jobs 
SET 
  next_run = NOW() + INTERVAL '6 hours',  -- Default 6 hours for all
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true;

-- Show results
SELECT 'AFTER FORCE UPDATE:' as result;
SELECT 
  name,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 STILL OVERDUE'
    ELSE '🟢 FIXED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
  END as status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run;
