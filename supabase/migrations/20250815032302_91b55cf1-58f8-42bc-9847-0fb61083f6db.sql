-- Fix the cron system by creating a better function and updating the cron job

-- First, create a new function that properly triggers scraping jobs
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  job_record RECORD;
  function_url TEXT;
  http_response_id BIGINT;
  jobs_triggered INTEGER := 0;
BEGIN
  -- Set the function URL
  function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
  
  -- Log the cron execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🔄 Auto-trigger function started', NOW());
  
  -- Find jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE (status = 'scheduled_for_trigger' OR (status = 'idle' AND next_run <= NOW()))
      AND (config->>'isActive')::boolean = true
  LOOP
    -- Update job status to running
    UPDATE public.scraping_jobs 
    SET status = 'running', updated_at = NOW()
    WHERE id = job_record.id;
    
    -- Trigger the scrape-events function
    BEGIN
      SELECT net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
          'x-trigger-source', 'cron-auto'
        ),
        body := jsonb_build_object(
          'jobId', job_record.id,
          'triggerSource', 'cron-auto-trigger'
        )::text
      ) INTO http_response_id;
      
      -- Calculate next run time and update job
      UPDATE public.scraping_jobs 
      SET 
        status = 'idle',
        last_run = NOW(),
        next_run = CASE 
          WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
            DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
          WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
          WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
          ELSE NOW() + INTERVAL '6 hours'
        END,
        updated_at = NOW()
      WHERE id = job_record.id;
      
      jobs_triggered := jobs_triggered + 1;
      
      -- Log successful trigger
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('✅ Triggered: ' || job_record.name, job_record.id, NOW());
      
    EXCEPTION WHEN OTHERS THEN
      -- Reset job status on error
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log the error
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES ('❌ Failed: ' || job_record.name, job_record.id, SQLERRM, NOW());
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🔄 Auto-trigger completed: ' || jobs_triggered || ' jobs triggered', NOW());
  
END;
$function$;

-- Now update the cron job to use this function
-- Only unschedule if the job exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scraping-jobs-runner-simple') THEN
    PERFORM cron.unschedule('scraping-jobs-runner-simple');
  END IF;
END $$;

-- Create the new cron job that runs every 15 minutes (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-trigger-scraping-jobs') THEN
    PERFORM cron.schedule(
      'auto-trigger-scraping-jobs',
      '*/15 * * * *',
      'SELECT public.trigger_due_scraping_jobs();'
    );
  END IF;
END $$;