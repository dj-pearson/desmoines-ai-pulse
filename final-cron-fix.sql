-- FINAL FIX: Reset the cron system completely
-- This will stop the infinite update loop and set proper schedules

-- First, let's see what's happening
SELECT 'CURRENT PROBLEM ANALYSIS:' as check_type;
SELECT 
  name,
  config->>'schedule' as schedule,
  last_run,
  updated_at,
  next_run,
  updated_at > COALESCE(last_run, '1970-01-01'::timestamptz) as keeps_getting_updated,
  CASE 
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    ELSE 'Other: ' || (config->>'schedule')
  END as friendly_schedule
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY name;

-- THE SOLUTION: Reset both next_run AND last_run to stop the update loop
SELECT 'APPLYING FINAL FIX - RESET LAST_RUN TO STOP UPDATE LOOP:' as action;

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
    ELSE NOW() + INTERVAL '6 hours'
  END,
  -- CRITICAL: Set last_run to NOW so the cron stops thinking schedules changed
  last_run = NOW(),
  -- Keep updated_at current but make it equal to last_run to stop the loop
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true;

-- Log this final fix
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔧 FINAL FIX: Reset all jobs with proper schedules and stopped update loop', NOW());

-- Show the result - should stop the update loop
SELECT 'AFTER FINAL FIX - UPDATE LOOP SHOULD BE STOPPED:' as result;
SELECT 
  name,
  config->>'schedule' as schedule,
  last_run,
  updated_at,
  next_run,
  updated_at > COALESCE(last_run, '1970-01-01'::timestamptz) as will_be_updated_again,
  CASE 
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    ELSE 'Other: ' || (config->>'schedule')
  END as friendly_schedule,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 OVERDUE (will be processed)'
    WHEN next_run <= NOW() + INTERVAL '2 hours' THEN '🟡 DUE SOON'
    ELSE '🟢 PROPERLY SCHEDULED'
  END as timing_status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run ASC;

-- Now test the cron - it should NOT update schedules anymore, only process due jobs
SELECT 'TESTING CRON - SHOULD NOT UPDATE SCHEDULES ANYMORE:' as test;
SELECT run_scraping_jobs_simple();

-- Final verification
SELECT 'FINAL VERIFICATION - SCHEDULES SHOULD BE STABLE NOW:' as final;
SELECT 
  name,
  status,
  config->>'schedule' as schedule,
  next_run,
  CASE 
    WHEN status = 'scheduled_for_trigger' THEN '🔵 READY FOR MANUAL TRIGGER'
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 SCHEDULED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/3600, 1) || ' hours)'
  END as final_status
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run ASC;

-- Show recent logs to confirm no more endless updates
SELECT 'RECENT LOGS - SHOULD SHOW STABILITY:' as logs;
SELECT 
  created_at,
  message,
  CASE 
    WHEN message ILIKE '%Auto-updated schedule%' THEN '🔄 Schedule Update'
    WHEN message ILIKE '%scheduled for manual trigger%' THEN '🔵 Ready to Trigger'
    WHEN message ILIKE '%Enhanced cron completed%' THEN '✅ Cron Complete'
    ELSE '📝 Other'
  END as message_type
FROM public.cron_logs 
WHERE created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 10;
