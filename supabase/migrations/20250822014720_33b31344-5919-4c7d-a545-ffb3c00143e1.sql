-- Fix scraping job scheduling - set overdue jobs to run immediately
-- The current jobs are scheduled for tomorrow instead of being available now

-- First, let's see the current problematic state
SELECT 
  name,
  status,
  next_run,
  NOW() as current_time,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 Should run now'
    ELSE '🟡 Future (' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/3600, 1) || 'h)'
  END as timing
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true;

-- Fix all active jobs to be available immediately for the next CRON run
UPDATE public.scraping_jobs 
SET 
  next_run = NOW() + INTERVAL '1 minute',  -- Available in 1 minute for next CRON cycle
  updated_at = NOW()
WHERE (config->>'isActive')::boolean = true;

-- Log this fix
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔧 MANUAL FIX: Reset all job schedules to run immediately', NOW());

-- Update the trigger function to properly handle different schedule types
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_triggered INTEGER := 0;
  function_result JSONB;
BEGIN
  -- Log the start
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🚀 Auto-trigger with direct function calls started', NOW());

  -- Process jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE status = 'idle' 
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
        -- Handle daily jobs (6 AM daily)
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN NOW() + INTERVAL '1 day'
        -- Handle weekly jobs (6 AM on Mondays)  
        WHEN job_record.config->>'schedule' = '0 6 * * 1' THEN NOW() + INTERVAL '7 days'
        -- Handle monthly jobs (6 AM on 1st of month)
        WHEN job_record.config->>'schedule' = '0 6 1 * *' THEN NOW() + INTERVAL '30 days'
        ELSE NOW() + INTERVAL '6 hours' -- Default to 6 hours
      END;
      
      -- Mark job as running and update schedule
      UPDATE public.scraping_jobs 
      SET 
        status = 'running',
        next_run = next_run_time,
        last_run = NOW(),
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Call the scrape-events function directly
      SELECT public.supabase_functions_invoke('scrape-events', json_build_object('job_id', job_record.id)::jsonb) INTO function_result;
      
      -- Update the job based on function result
      IF function_result IS NOT NULL AND function_result->>'success' = 'true' THEN
        -- Update events found count
        UPDATE public.scraping_jobs 
        SET 
          status = 'idle',
          events_found = COALESCE((function_result->>'events_found')::integer, 0),
          updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log successful execution
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES (
          '✅ Job executed successfully: ' || job_record.name || ' (found ' || COALESCE((function_result->>'events_found')::text, '0') || ' events)',
          job_record.id,
          NOW()
        );
      ELSE
        -- Reset job status on failure
        UPDATE public.scraping_jobs 
        SET status = 'idle', updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log the failure
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          'Failed to execute job: ' || job_record.name,
          job_record.id,
          COALESCE(function_result->>'error', 'Unknown error'),
          NOW()
        );
      END IF;
      
      jobs_triggered := jobs_triggered + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Reset job status on error
      UPDATE public.scraping_jobs 
      SET status = 'idle', updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log the error
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES (
        'Error executing job: ' || job_record.name,
        job_record.id,
        SQLERRM,
        NOW()
      );
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🚀 Auto-trigger completed: ' || jobs_triggered || ' jobs executed automatically', NOW());
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the fix
SELECT 
  'After Fix:' as status,
  name,
  status,
  next_run,
  NOW() as current_time,
  CASE 
    WHEN next_run <= NOW() THEN '🟢 Available now'
    ELSE '🕒 In ' || ROUND(EXTRACT(EPOCH FROM (next_run - NOW()))/60) || ' min'
  END as timing
FROM public.scraping_jobs
WHERE (config->>'isActive')::boolean = true
ORDER BY next_run;