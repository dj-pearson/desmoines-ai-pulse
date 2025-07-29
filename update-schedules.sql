-- ENHANCED AUTOMATIC CRON FUNCTION - Detects schedule changes automatically
-- This version updates next_run times when schedules change and processes due jobs

CREATE OR REPLACE FUNCTION run_scraping_jobs_simple()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
  schedules_updated INTEGER := 0;
BEGIN
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting enhanced cron job run (auto-detects schedule changes)', NOW());
  
  -- First, update any jobs where the schedule has changed but next_run wasn't recalculated
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE (config->>'isActive')::boolean = true
      AND updated_at > COALESCE(last_run, '1970-01-01'::timestamptz)  -- Schedule was changed after last run
      AND status != 'running'
  LOOP
    -- Recalculate next_run based on current schedule
    next_run_time := CASE 
      WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
      WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
      WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
      WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
      WHEN job_record.config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
      WHEN job_record.config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
      WHEN job_record.config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
      WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
        CASE 
          WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
          ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
        END
      ELSE NOW() + INTERVAL '6 hours' -- Default to 6 hours
    END;
    
    -- Update the job with new schedule
    UPDATE public.scraping_jobs 
    SET next_run = next_run_time
    WHERE id = job_record.id;
    
    -- Log the schedule update
    INSERT INTO public.cron_logs (message, job_id, created_at) 
    VALUES ('🔄 Auto-updated schedule for: ' || job_record.name || ' (new next run: ' || next_run_time || ')', job_record.id, NOW());
    
    schedules_updated := schedules_updated + 1;
  END LOOP;
  
  -- Now process jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE status != 'running' 
      AND next_run <= NOW()
      AND (config->>'isActive')::boolean = true
  LOOP
    BEGIN
      -- Calculate next run time based on schedule
      next_run_time := CASE 
        WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
        WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
        WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
        WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
        WHEN job_record.config->>'schedule' = '0 */4 * * *' THEN NOW() + INTERVAL '4 hours'
        WHEN job_record.config->>'schedule' = '0 */2 * * *' THEN NOW() + INTERVAL '2 hours'
        WHEN job_record.config->>'schedule' = '0 */1 * * *' THEN NOW() + INTERVAL '1 hour'
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          END
        ELSE NOW() + INTERVAL '6 hours' -- Default to 6 hours
      END;
      
      -- Update job: mark as due for manual trigger and reschedule
      UPDATE public.scraping_jobs 
      SET 
        status = 'scheduled_for_trigger',  -- Special status for manual triggering
        next_run = next_run_time,
        last_run = NOW(),
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log that job is ready for manual trigger
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('🔵 Job scheduled for manual trigger: ' || job_record.name || ' (next run: ' || next_run_time || ')', job_record.id, NOW());
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log the error and reset job status
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES (
        '❌ Error processing job: ' || job_record.name, 
        job_record.id,
        SQLERRM,
        NOW()
      );
      
      -- Reset job status to idle and retry in 1 hour
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Log summary
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('✅ Enhanced cron completed. Updated ' || schedules_updated || ' schedules, processed ' || jobs_processed || ' jobs.', NOW());
  
  -- Clean up old cron logs (keep last 100 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the enhanced function
SELECT 'TESTING ENHANCED AUTO-UPDATE FUNCTION:' as test;
SELECT run_scraping_jobs_simple();

-- Show current status after enhancement
SELECT 'CURRENT STATUS WITH AUTO-UPDATE:' as info;
SELECT 
  name,
  status,
  last_run,
  next_run,
  config->>'schedule' as cron_schedule,
  CASE 
    WHEN config->>'schedule' = '0 */6 * * *' THEN 'Every 6 hours'
    WHEN config->>'schedule' = '0 */3 * * *' THEN 'Every 3 hours'
    WHEN config->>'schedule' = '0 */8 * * *' THEN 'Every 8 hours'
    WHEN config->>'schedule' = '0 */12 * * *' THEN 'Every 12 hours'
    WHEN config->>'schedule' = '0 */4 * * *' THEN 'Every 4 hours'
    WHEN config->>'schedule' = '0 */2 * * *' THEN 'Every 2 hours'
    WHEN config->>'schedule' = '0 */1 * * *' THEN 'Every hour'
    WHEN config->>'schedule' = '0 6 * * *' THEN 'Daily at 6 AM'
    ELSE 'Custom: ' || (config->>'schedule')
  END as friendly_schedule,
  CASE 
    WHEN status = 'scheduled_for_trigger' THEN '🔵 READY FOR MANUAL TRIGGER'
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 DUE SOON (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
    ELSE '🟢 SCHEDULED (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min)'
  END as status_info,
  (config->>'isActive')::boolean as is_active
FROM public.scraping_jobs
ORDER BY next_run ASC;

-- Show recent cron activity
SELECT 'RECENT ENHANCED CRON ACTIVITY:' as logs;
SELECT 
  created_at,
  message,
  job_id,
  CASE 
    WHEN error_details IS NULL THEN '✅ Success'
    ELSE '❌ Error: ' || error_details
  END as result
FROM public.cron_logs 
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
