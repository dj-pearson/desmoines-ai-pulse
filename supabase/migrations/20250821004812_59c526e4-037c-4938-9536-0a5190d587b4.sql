-- Fix the cron system to actually trigger jobs automatically
-- Update the trigger function to directly call the scraping edge function

CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
  function_response JSONB;
BEGIN
  -- Log the cron execution
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🚀 Auto-trigger with direct function calls started', NOW());
  END IF;
  
  -- Process jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE (status = 'scheduled_for_trigger' OR (status = 'idle' AND next_run <= NOW()))
      AND (config->>'isActive')::boolean = true
  LOOP
    BEGIN
      -- Calculate next run time based on schedule
      next_run_time := CASE 
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          END
        WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
        WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
        WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
        WHEN job_record.config->>'schedule' = '0 6 1 * *' THEN 
          DATE_TRUNC('month', NOW()) + INTERVAL '1 month 6 hours'
        WHEN job_record.config->>'schedule' = '0 6 * * 1' THEN 
          DATE_TRUNC('week', NOW()) + INTERVAL '1 week 6 hours'
        ELSE NOW() + INTERVAL '6 hours'
      END;
      
      -- Mark job as running
      UPDATE public.scraping_jobs 
      SET 
        status = 'running',
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Call the scrape-events function directly using supabase.functions.invoke
      SELECT supabase.functions.invoke(
        'scrape-events',
        json_build_object(
          'jobId', job_record.id,
          'triggerSource', 'cron-auto'
        )::jsonb
      ) INTO function_response;
      
      -- Update job with results and reschedule
      UPDATE public.scraping_jobs 
      SET 
        status = 'idle',
        next_run = next_run_time,
        last_run = NOW(),
        updated_at = NOW(),
        events_found = COALESCE((function_response->>'total_events_found')::integer, 0)
      WHERE id = job_record.id;
      
      -- Log successful execution
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES (
          '✅ Auto-executed job: ' || job_record.name || 
          ' - found ' || COALESCE((function_response->>'total_events_found')::integer, 0) || ' events' ||
          ' (next: ' || next_run_time || ')', 
          job_record.id, 
          NOW()
        );
      END IF;
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and reset job
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES ('❌ Error auto-executing: ' || job_record.name, job_record.id, SQLERRM, NOW());
      END IF;
      
      -- Reset job status and retry later
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Log completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🚀 Auto-trigger completed: ' || jobs_processed || ' jobs executed automatically', NOW());
  END IF;
  
  -- Clean up old logs
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$;