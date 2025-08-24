-- SAFE FUNCTION REPLACEMENT: Drop and recreate with proper signature
-- Run this in Supabase SQL Editor

-- Step 1: Drop the existing function completely
DROP FUNCTION IF EXISTS run_scraping_jobs();

-- Step 2: Recreate with the original simple signature
CREATE OR REPLACE FUNCTION run_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  function_url TEXT;
BEGIN
  -- Get the Supabase project URL 
  function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
  
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting scheduled scraping job run', NOW());
  
  -- Loop through all active jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scraping_jobs 
    WHERE status != 'running' 
      AND next_run <= NOW()
      AND (config->>'isActive')::boolean = true
  LOOP
    BEGIN
      -- Update job status to running
      UPDATE public.scraping_jobs 
      SET status = 'running', updated_at = NOW()
      WHERE id = job_record.id;
      
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
      
      -- Update the next run time IMMEDIATELY so it doesn't get stuck
      UPDATE public.scraping_jobs 
      SET next_run = next_run_time, updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Try to call the scrape-events function via HTTP (if net extension available)
      BEGIN
        PERFORM net.http_post(
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
        
        -- Mark job as completed
        UPDATE public.scraping_jobs 
        SET status = 'idle', last_run = NOW(), updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log successful job trigger
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('Successfully triggered scraping job: ' || job_record.name, job_record.id, NOW());
        
      EXCEPTION WHEN OTHERS THEN
        -- HTTP failed, but job is still rescheduled
        UPDATE public.scraping_jobs 
        SET status = 'idle', last_run = NOW(), updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log the error but continue
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES (
          'HTTP trigger failed for job: ' || job_record.name, 
          job_record.id,
          SQLERRM,
          NOW()
        );
      END;
      
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
  
  -- Clean up old cron logs (keep last 100 entries)
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the recreated function
SELECT 'TESTING RECREATED FUNCTION:' as test;
SELECT run_scraping_jobs();
