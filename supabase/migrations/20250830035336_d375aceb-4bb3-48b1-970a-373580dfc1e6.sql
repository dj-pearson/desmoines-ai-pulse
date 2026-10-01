-- WEB-SEC-032: a service_role JWT was written here as a literal in 2025. It is
-- replaced with the Vault read the rest of the codebase uses. This file is
-- APPLIED HISTORY and is never re-run, so editing it changes no database --
-- what it does is stop the tree carrying a live credential. The key that was
-- installed by this migration is removed from the DATABASE by
-- 20260902000015_purge_embedded_service_key.sql, and rotating it is a
-- separate, owner-only action (docs/SECRETS_ROTATION.md).
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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('Starting enhanced cron job run (auto-detects schedule changes)', NOW());
  END IF;
  
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
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('🔄 Auto-updated schedule for: ' || job_record.name || ' (new next run: ' || next_run_time || ')', job_record.id, NOW());
    END IF;
    
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
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('🔵 Job scheduled for manual trigger: ' || job_record.name || ' (next run: ' || next_run_time || ')', job_record.id, NOW());
      END IF;
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log the error and reset job status
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          '❌ Error processing job: ' || job_record.name, 
          job_record.id,
          SQLERRM,
          NOW()
        );
      END IF;
      
      -- Reset job status to idle and retry in 1 hour
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Trigger AI enhancement when we process jobs (every 20 scraping jobs triggers AI enhancement)
  IF jobs_processed > 0 AND (jobs_processed % 20 = 0 OR (EXTRACT(HOUR FROM NOW()) IN (6, 18) AND jobs_processed > 0)) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
      INSERT INTO public.cron_logs (message, created_at) 
      VALUES ('🤖 Triggering AI bulk enhancement (processed ' || jobs_processed || ' jobs or scheduled time)', NOW());
    END IF;
    
    -- Call bulk enhancement function via HTTP
    BEGIN
      PERFORM net.http_post(
        url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/bulk-enhance-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.app_secret('service_role_key'),
          'x-trigger-source', 'cron'
        ),
        body := jsonb_build_object(
          'batchSize', 15,
          'triggerSource', 'cron'
        )::text
      );
      
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, created_at) 
        VALUES ('✨ AI bulk enhancement triggered successfully (batch size: 15)', NOW());
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
        INSERT INTO public.cron_logs (message, error_details, created_at) 
        VALUES ('❌ Failed to trigger AI bulk enhancement', SQLERRM, NOW());
      END IF;
    END;
  END IF;

  -- Log completion
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('✅ Enhanced cron completed. Updated ' || schedules_updated || ' schedules, processed ' || jobs_processed || ' jobs.', NOW());
  END IF;
  
  -- Clean up old cron logs (keep last 100 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$function$;