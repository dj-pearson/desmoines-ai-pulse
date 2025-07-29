-- FIX HTTP EXTENSION ISSUE
-- Run this in Supabase SQL Editor to enable HTTP calls

-- Step 1: Enable the http extension
CREATE EXTENSION IF NOT EXISTS http;

-- Step 2: Grant permissions for HTTP calls
-- Note: This might require superuser privileges in some Supabase setups

-- Step 3: Test if the extension works now
SELECT 'TESTING HTTP EXTENSION:' as test_type;

-- Simple HTTP test (this should work if extension is enabled)
SELECT status, content::text as response
FROM http_get('https://httpbin.org/get');

-- Step 4: Update the cron function to handle missing HTTP extension gracefully
CREATE OR REPLACE FUNCTION run_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  function_url TEXT;
  http_available BOOLEAN DEFAULT false;
BEGIN
  -- Check if HTTP extension is available
  BEGIN
    PERFORM 1 FROM pg_extension WHERE extname = 'http';
    http_available := true;
  EXCEPTION WHEN OTHERS THEN
    http_available := false;
  END;
  
  -- Get the Supabase project URL 
  function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
  
  -- Log the cron job execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('Starting scheduled scraping job run (HTTP available: ' || http_available || ')', NOW());
  
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
      
      -- Try to call the scrape-events function via HTTP (if available)
      IF http_available THEN
        BEGIN
          PERFORM http_post(
            function_url,
            jsonb_build_object(
              'jobId', job_record.id,
              'triggerSource', 'cron'
            )::text,
            'application/json',
            jsonb_build_object(
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
              'x-trigger-source', 'cron'
            )
          );
          
          -- Mark job as completed
          UPDATE public.scraping_jobs 
          SET status = 'idle', last_run = NOW(), updated_at = NOW()
          WHERE id = job_record.id;
          
          -- Log successful job trigger
          INSERT INTO public.cron_logs (message, job_id, created_at) 
          VALUES ('Successfully triggered scraping job via HTTP: ' || job_record.name, job_record.id, NOW());
          
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
      ELSE
        -- HTTP not available, just mark as attempted
        UPDATE public.scraping_jobs 
        SET status = 'idle', last_run = NOW(), updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log that HTTP is not available
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('Job scheduled but HTTP extension not available: ' || job_record.name, job_record.id, NOW());
      END IF;
      
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

-- Step 5: Test the updated function
SELECT 'TESTING UPDATED FUNCTION:' as test_type;
SELECT run_scraping_jobs();
