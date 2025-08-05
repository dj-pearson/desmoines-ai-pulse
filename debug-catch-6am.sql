-- IMMEDIATE DEBUG: Check what's actually saved in database for Catch Des Moines
-- Run this RIGHT NOW to see the exact database state

SELECT 'CATCH DES MOINES CURRENT DATABASE STATE:' as check_type;
SELECT 
  id,
  name,
  status,
  config,
  config->>'schedule' as actual_schedule_in_db,
  config->>'isActive' as is_active_in_db,
  created_at,
  updated_at,
  last_run,
  next_run,
  CASE 
    WHEN config->>'schedule' = '0 6 * * *' THEN '✅ CORRECT: Daily at 6 AM'
    WHEN config->>'schedule' = '0 18 * * *' THEN '❌ WRONG: Daily at 6 PM (Evening)'
    WHEN config->>'schedule' = '0 */6 * * *' THEN '❌ WRONG: Every 6 hours'
    ELSE '❌ OTHER: ' || (config->>'schedule')
  END as schedule_check,
  updated_at > last_run as config_changed_since_last_run
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%'
ORDER BY updated_at DESC;

-- Show what the cron function SHOULD calculate for 6 AM daily
SELECT 'WHAT 6 AM DAILY SHOULD CALCULATE TO:' as calculation;
SELECT 
  NOW() as current_time,
  EXTRACT(HOUR FROM NOW()) as current_hour,
  DATE_TRUNC('day', NOW()) + INTERVAL '6 hours' as if_before_6am,
  DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours' as if_after_6am,
  CASE 
    WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN 
      DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
    ELSE 
      DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
  END as correct_next_run_for_6am;

-- Force update Catch Des Moines to 6 AM schedule
SELECT 'MANUALLY FORCING CATCH DES MOINES TO 6 AM:' as action;
UPDATE public.scraping_jobs 
SET 
  config = jsonb_set(config, '{schedule}', '"0 6 * * *"'),
  updated_at = NOW()
WHERE name ILIKE '%Catch%';

-- Check what we just updated
SELECT 'AFTER MANUAL UPDATE TO 6 AM:' as result;
SELECT 
  name,
  config->>'schedule' as new_schedule,
  updated_at,
  next_run as old_next_run,
  'Should be updated by cron' as note
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%';

-- Run the enhanced cron to process this change
SELECT 'RUNNING ENHANCED CRON NOW:' as test;
SELECT run_scraping_jobs_simple();

-- Show final result
SELECT 'FINAL RESULT AFTER CRON:' as final;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  last_run,
  next_run,
  CASE 
    WHEN next_run::date = (NOW() + INTERVAL '1 day')::date 
         AND EXTRACT(HOUR FROM next_run) = 6 THEN '✅ CORRECT: Tomorrow at 6 AM'
    WHEN next_run::date = NOW()::date 
         AND EXTRACT(HOUR FROM next_run) = 6 THEN '✅ CORRECT: Today at 6 AM'
    ELSE '❌ WRONG: ' || next_run
  END as next_run_check
FROM public.scraping_jobs
WHERE name ILIKE '%Catch%';
