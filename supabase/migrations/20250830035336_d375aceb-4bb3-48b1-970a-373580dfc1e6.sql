-- Update the existing CRON function to include AI bulk enhancement
CREATE OR REPLACE FUNCTION public.run_scraping_jobs_simple()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      WHEN job_record.config->>'schedule' = '0 18 * * *' THEN 
        CASE 
          WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '18 hours'
          ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
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
        WHEN job_record.config->>'schedule' = '0 18 * * *' THEN 
          CASE 
            WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
            ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 18 hours'
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
  
  -- Trigger AI enhancement when we process jobs (every 20 scraping jobs triggers AI enhancement)
  IF jobs_processed > 0 AND (jobs_processed % 20 = 0 OR (EXTRACT(HOUR FROM NOW()) IN (6, 18) AND jobs_processed > 0)) THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🤖 Triggering AI bulk enhancement (processed ' || jobs_processed || ' jobs or scheduled time)', NOW());
    
    -- Call bulk enhancement function via HTTP
    BEGIN
      PERFORM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/bulk-enhance-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.zsR9yYH5T0UnQT9U-umyUf--yIiDYJMMF4tvhkzPzRM',
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object(
          'batchSize', 15,
          'triggerSource', 'cron'
        )::text
      );
      
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('✨ AI bulk enhancement triggered successfully (batch size: 15)', NOW());
      
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_logs (message, error_details, created_at) 
      VALUES ('❌ Failed to trigger AI bulk enhancement', SQLERRM, NOW());
    END;
  END IF;

  -- Log completion
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
$function$;