-- Fix security issues related to the functions we just updated
-- Specifically address Function Search Path Mutable warnings

-- Update the trigger function to have proper search_path
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
BEGIN
  -- Log the cron execution
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔄 Auto-trigger function started (no HTTP dependency)', NOW());
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
      
      -- Update job: mark as ready for manual trigger and reschedule
      UPDATE public.scraping_jobs 
      SET 
        status = 'scheduled_for_trigger',
        next_run = next_run_time,
        last_run = NOW(),
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log that job is ready for trigger
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('🔵 Job ready for trigger: ' || job_record.name || ' (next: ' || next_run_time || ')', job_record.id, NOW());
      END IF;
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and reset job
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES ('❌ Error processing: ' || job_record.name, job_record.id, SQLERRM, NOW());
      END IF;
      
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Log completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔄 Auto-trigger completed: ' || jobs_processed || ' jobs processed', NOW());
  END IF;
  
  -- Clean up old logs
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';