-- ALTERNATIVE: CRON WITHOUT HTTP DEPENDENCY
-- This version works without HTTP extensions by just updating job status

-- Create a simplified cron function that doesn't need HTTP
CREATE OR REPLACE FUNCTION run_scraping_jobs_simple()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
BEGIN
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting simplified cron job run (no HTTP dependency)', NOW());
  
  -- Loop through all active jobs that are due to run
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
      VALUES ('Job scheduled for manual trigger: ' || job_record.name || ' (next run: ' || next_run_time || ')', job_record.id, NOW());
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log the error and reset job status
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES (
        'Error processing job: ' || job_record.name, 
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
  VALUES ('Cron run completed. Processed ' || jobs_processed || ' jobs.', NOW());
  
  -- Clean up old cron logs (keep last 100 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the cron job to use the simple version
SELECT cron.unschedule('scraping-jobs-runner');
SELECT cron.schedule(
  'scraping-jobs-runner-simple',
  '*/30 * * * *', -- Every 30 minutes
  'SELECT run_scraping_jobs_simple();'
);

-- Show jobs that are ready for manual triggering
SELECT 'JOBS READY FOR MANUAL TRIGGER:' as status;
SELECT 
  name,
  status,
  last_run,
  next_run,
  CASE 
    WHEN status = 'scheduled_for_trigger' THEN '🔵 READY FOR MANUAL TRIGGER'
    WHEN next_run <= NOW() THEN '🔴 OVERDUE'
    ELSE '🟢 SCHEDULED'
  END as trigger_status
FROM public.scraping_jobs
WHERE status = 'scheduled_for_trigger' OR next_run <= NOW()
ORDER BY last_run DESC;

-- Test the simple function
SELECT 'TESTING SIMPLE FUNCTION:' as test;
SELECT run_scraping_jobs_simple();
