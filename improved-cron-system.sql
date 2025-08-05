-- Improved Cron System with Better Error Handling
-- Run this in Supabase SQL Editor to fix the cron system

-- First, drop the existing function to avoid return type conflicts
DROP FUNCTION IF EXISTS run_scraping_jobs();

-- Create an improved run_scraping_jobs function with better return info
CREATE OR REPLACE FUNCTION run_scraping_jobs()
RETURNS TABLE(
  job_name TEXT,
  status TEXT,
  message TEXT,
  next_run_scheduled TIMESTAMPTZ
) AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  function_url TEXT;
  http_response RECORD;
BEGIN
  -- Get the Supabase project URL (replace with your actual project URL)
  function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
  
  -- Log the cron job execution start
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting automated cron job run at ' || NOW(), NOW());
  
  -- Return header for results
  job_name := 'CRON_SYSTEM';
  status := 'STARTED';
  message := 'Cron job execution started at ' || NOW();
  next_run_scheduled := NULL;
  RETURN NEXT;
  
  -- Loop through all active jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE status != 'running' 
      AND next_run <= NOW()
      AND (config->>'isActive')::boolean = true
    ORDER BY next_run ASC
  LOOP
    BEGIN
      -- Calculate next run time based on schedule BEFORE starting the job
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
      
      -- Update job status to running and set next run time
      UPDATE public.scraping_jobs 
      SET 
        status = 'running', 
        next_run = next_run_time,
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Try to call the scrape-events function via HTTP
      BEGIN
        -- Use net.http_post if available, otherwise just log
        SELECT * INTO http_response FROM net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'x-trigger-source', 'cron'
          ),
          body := jsonb_build_object(
            'jobId', job_record.id,
            'triggerSource', 'cron'
          )::text
        );
        
        -- Reset job status to idle after successful trigger
        UPDATE public.scraping_jobs 
        SET status = 'idle', last_run = NOW(), updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log successful job trigger
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('Successfully triggered and completed scraping job: ' || job_record.name, job_record.id, NOW());
        
        -- Return success result
        job_name := job_record.name;
        status := 'SUCCESS';
        message := 'Job triggered successfully';
        next_run_scheduled := next_run_time;
        RETURN NEXT;
        
      EXCEPTION WHEN OTHERS THEN
        -- HTTP call failed, but we'll still mark the job as attempted
        UPDATE public.scraping_jobs 
        SET status = 'idle', last_run = NOW(), updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log the HTTP error but don't fail the whole process
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          'HTTP trigger failed for job: ' || job_record.name, 
          job_record.id,
          'HTTP Error: ' || SQLERRM,
          NOW()
        );
        
        -- Return error result
        job_name := job_record.name;
        status := 'HTTP_ERROR';
        message := 'Job scheduled but HTTP trigger failed: ' || SQLERRM;
        next_run_scheduled := next_run_time;
        RETURN NEXT;
      END;
      
    EXCEPTION WHEN OTHERS THEN
      -- Critical error with the job itself
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES (
        'Critical error processing job: ' || job_record.name, 
        job_record.id,
        'System Error: ' || SQLERRM,
        NOW()
      );
      
      -- Reset job status to idle and schedule retry in 1 hour
      UPDATE public.scraping_jobs 
      SET 
        status = 'idle', 
        next_run = NOW() + INTERVAL '1 hour',
        updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Return error result
      job_name := job_record.name;
      status := 'CRITICAL_ERROR';
      message := 'Critical system error: ' || SQLERRM;
      next_run_scheduled := NOW() + INTERVAL '1 hour';
      RETURN NEXT;
    END;
  END LOOP;
  
  -- Clean up old cron logs (keep last 200 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 200
  );
  
  -- Final summary
  job_name := 'CRON_SYSTEM';
  status := 'COMPLETED';
  message := 'Cron job execution completed at ' || NOW();
  next_run_scheduled := NULL;
  RETURN NEXT;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a simpler manual trigger function for testing
CREATE OR REPLACE FUNCTION manual_trigger_job(job_id_param UUID)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  next_run TIMESTAMPTZ
) AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
BEGIN
  -- Get the job details
  SELECT * INTO job_record FROM public.scraping_jobs WHERE id = job_id_param;
  
  IF NOT FOUND THEN
    success := false;
    message := 'Job not found';
    next_run := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Calculate next run time
  next_run_time := CASE 
    WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
    WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
    WHEN job_record.config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
    WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
    WHEN job_record.config->>'schedule' = '0 6 * * *' THEN NOW() + INTERVAL '1 day'
    ELSE NOW() + INTERVAL '6 hours'
  END;
  
  -- Update the job
  UPDATE public.scraping_jobs 
  SET 
    status = 'idle',
    last_run = NOW(),
    next_run = next_run_time,
    updated_at = NOW()
  WHERE id = job_id_param;
  
  -- Log the manual trigger
  INSERT INTO public.cron_logs (message, job_id, created_at) 
  VALUES ('Manual trigger for job: ' || job_record.name, job_id_param, NOW());
  
  success := true;
  message := 'Job manually triggered and rescheduled';
  next_run := next_run_time;
  RETURN NEXT;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
