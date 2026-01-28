-- COMPREHENSIVE CRON SYSTEM FIX
-- Enable required extensions and fix all scheduling issues

-- Step 1: Enable the net extension for HTTP requests (skip if not available)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS net;
EXCEPTION WHEN OTHERS THEN
  -- Extension not available (e.g., in shadow database), skip
END $$;

-- Step 2: Update the trigger function to use net extension properly
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void AS $$
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
  VALUES ('🔄 Auto-trigger function started (with net extension)', NOW());
  
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
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUzNzk3NywiZXhwIjoyMDY5MTEzOTc3fQ.nXVf5mUa1FVBBa0dWZqpONT3N1dAIXBXWF1nVNPzWJE',
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
            CASE 
              WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
              ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
            END
          WHEN job_record.config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
          WHEN job_record.config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
          WHEN job_record.config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
          WHEN job_record.config->>'schedule' = '0 6 1 * *' THEN NOW() + INTERVAL '1 month'
          WHEN job_record.config->>'schedule' = '0 6 * * 1' THEN 
            DATE_TRUNC('week', NOW()) + INTERVAL '1 week 6 hours'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Reset all overdue jobs to run soon with staggered timing
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraping_jobs') THEN
    UPDATE public.scraping_jobs 
    SET 
      next_run = CASE 
        -- Stagger jobs to avoid overwhelming the system
        WHEN name LIKE '%Google%' THEN NOW() + INTERVAL '2 minutes'
        WHEN name LIKE '%Catch%' THEN NOW() + INTERVAL '4 minutes'
        WHEN name LIKE '%Iowa Events%' THEN NOW() + INTERVAL '6 minutes'
        WHEN name LIKE '%Vibrant%' THEN NOW() + INTERVAL '8 minutes'
        WHEN name LIKE '%Cubs%' THEN NOW() + INTERVAL '10 minutes'
        WHEN name LIKE '%Wolves%' THEN NOW() + INTERVAL '12 minutes'
        WHEN name LIKE '%Wild%' THEN NOW() + INTERVAL '14 minutes'
        WHEN name LIKE '%Barnstormers%' THEN NOW() + INTERVAL '16 minutes'
        ELSE NOW() + INTERVAL '3 minutes'
      END,
      status = 'idle',
      updated_at = NOW()
    WHERE next_run <= NOW() OR status = 'scheduled_for_trigger';
  END IF;
END $$;

-- Step 4: Ensure all jobs have proper configuration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraping_jobs') THEN
    UPDATE public.scraping_jobs 
    SET config = config || jsonb_build_object(
      'isActive', true,
      'schedule', COALESCE(config->>'schedule', '0 */6 * * *')
    )
    WHERE (config->>'isActive') IS NULL OR (config->>'schedule') IS NULL;
  END IF;
END $$;

-- Step 5: Log this comprehensive fix
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔧 COMPREHENSIVE CRON FIX: Enabled net extension, updated functions, reset all job schedules', NOW());
  END IF;
END $$;