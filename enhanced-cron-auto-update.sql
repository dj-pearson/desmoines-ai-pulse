
-- ENHANCED CRON FUNCTION - Calls Social Media Manager for automated posts
-- This version triggers social media posts at appropriate times

CREATE OR REPLACE FUNCTION run_scraping_jobs_simple()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
  schedules_updated INTEGER := 0;
  social_media_response TEXT;
BEGIN
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting simplified cron job run with social media automation', NOW());
  
  -- Call social media manager for automated posting checks
  BEGIN
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/social-media-manager',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY'))
      ),
      body := jsonb_build_object(
        'action', 'automated_check',
        'triggerSource', 'cron'
      )
    ) INTO social_media_response;
    
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('Social media automation check completed: ' || COALESCE(social_media_response, 'no response'), NOW());
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_logs (message, error_details, created_at) 
    VALUES ('Social media automation failed', SQLERRM, NOW());
  END;
  
  -- First, update any jobs where the schedule has changed but next_run wasn't recalculated
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE (config->>'isActive')::boolean = true
      AND updated_at > last_run  -- Schedule was changed after last run
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
    VALUES ('Schedule updated for: ' || job_record.name || ' (new next run: ' || next_run_time || ')', job_record.id, NOW());
    
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
  VALUES ('Cron run completed. Updated ' || schedules_updated || ' schedules, processed ' || jobs_processed || ' jobs, checked social media automation.', NOW());
  
  -- Clean up old cron logs (keep last 100 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
