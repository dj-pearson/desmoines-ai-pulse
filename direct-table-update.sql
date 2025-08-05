-- DIRECT TABLE UPDATE - Simple and clear
-- This will definitively fix the scraping_jobs table

-- First, see current state
SELECT 'BEFORE UPDATE:' as stage;
SELECT 
  name,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 FUTURE (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/3600, 1) || 'h)'
  END as status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY name;

-- Update each schedule type explicitly
SELECT 'UPDATING 6-HOUR JOBS:' as action;
UPDATE public.scraping_jobs 
SET 
  next_run = NOW() + INTERVAL '6 hours',
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true 
  AND config->>'schedule' = '0 */6 * * *';

SELECT 'UPDATING 12-HOUR JOBS:' as action;
UPDATE public.scraping_jobs 
SET 
  next_run = NOW() + INTERVAL '12 hours',
  last_run = NOW(),
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true 
  AND config->>'schedule' = '0 */12 * * *';

SELECT 'UPDATING DAILY 6AM JOBS:' as action;
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

-- Check results
SELECT 'AFTER UPDATE:' as stage;
SELECT 
  name,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 FUTURE (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/3600, 1) || 'h)'
  END as status,
  CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    ELSE 'Other'
  END as schedule_type
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run;

-- Verify the update worked
SELECT 'VERIFICATION - JOBS UPDATED:' as verify;
SELECT 
  COUNT(*) as total_active_jobs,
  COUNT(CASE WHEN last_run >= NOW() - INTERVAL '1 minute' THEN 1 END) as jobs_just_updated,
  COUNT(CASE WHEN next_run > NOW() THEN 1 END) as jobs_scheduled_future
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true;
