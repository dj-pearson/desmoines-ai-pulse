-- Fix the cron function to use proper HTTP calls instead of invalid supabase_functions_invoke
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_triggered INTEGER := 0;
  http_response RECORD;
BEGIN
  -- Log the start
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🚀 Auto-trigger with HTTP calls started', NOW());
  END IF;

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
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
          END
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
      
      -- Call the scrape-events function via HTTP
      SELECT * INTO http_response FROM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object('jobId', job_record.id, 'triggerSource', 'cron')
      );
      
      -- Check if HTTP call was successful (status 200-299)
      IF http_response.status_code >= 200 AND http_response.status_code < 300 THEN
        -- Update job as completed
        UPDATE public.scraping_jobs 
        SET 
          status = 'idle',
          updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log successful execution
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
          INSERT INTO public.cron_logs (message, job_id, created_at) 
          VALUES (
            '✅ Job executed successfully: ' || job_record.name || ' (HTTP ' || http_response.status_code || ')',
            job_record.id,
            NOW()
          );
        END IF;
      ELSE
        -- Reset job status on HTTP failure
        UPDATE public.scraping_jobs 
        SET status = 'idle', updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log the HTTP failure
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
          INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
          VALUES (
            'HTTP call failed for job: ' || job_record.name,
            job_record.id,
            'HTTP Status: ' || http_response.status_code || ', Response: ' || COALESCE(http_response.content::text, 'No response content'),
            NOW()
          );
        END IF;
      END IF;
      
      jobs_triggered := jobs_triggered + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Reset job status on error
      UPDATE public.scraping_jobs 
      SET status = 'idle', updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log the error
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          'Error executing job: ' || job_record.name,
          job_record.id,
          SQLERRM,
          NOW()
        );
      END IF;
    END;
  END LOOP;
  
  -- Log completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🚀 Auto-trigger completed: ' || jobs_triggered || ' jobs executed with HTTP calls', NOW());
  END IF;
  
END;
$function$;