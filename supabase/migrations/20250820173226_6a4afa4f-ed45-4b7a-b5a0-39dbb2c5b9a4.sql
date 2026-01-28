-- CRON SYSTEM FIX WITHOUT NET EXTENSION
-- Fix all scheduling issues and update functions to work without net extension

-- Step 1: Update the trigger function to work without net extension
CREATE OR REPLACE FUNCTION public.trigger_due_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  jobs_processed INTEGER := 0;
BEGIN
  -- Log the cron execution
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🔄 Auto-trigger function started (no HTTP dependency)', NOW());
  
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
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('🔵 Job ready for trigger: ' || job_record.name || ' (next: ' || next_run_time || ')', job_record.id, NOW());
      
      jobs_processed := jobs_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and reset job
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES ('❌ Error processing: ' || job_record.name, job_record.id, SQLERRM, NOW());
      
      UPDATE public.scraping_jobs 
      SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
      WHERE id = job_record.id;
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO public.cron_logs (message, created_at) 
  VALUES ('🔄 Auto-trigger completed: ' || jobs_processed || ' jobs processed', NOW());
  
  -- Clean up old logs
  DELETE FROM public.cron_logs 
  WHERE id NOT IN (
    SELECT id FROM public.cron_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Reset all overdue jobs with staggered timing
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraping_jobs') THEN
    UPDATE public.scraping_jobs 
    SET 
      next_run = CASE 
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

-- Step 3: Ensure all jobs have proper configuration
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

-- Step 4: Update the cron job to run more frequently for better responsiveness
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-trigger-scraping-jobs') THEN
    PERFORM cron.unschedule('auto-trigger-scraping-jobs');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-trigger-scraping-jobs') THEN
    PERFORM cron.schedule(
      'auto-trigger-scraping-jobs',
      '*/10 * * * *', -- Every 10 minutes
      'SELECT public.trigger_due_scraping_jobs();'
    );
  END IF;
END $$;

-- Step 5: Log this fix
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_logs') THEN
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔧 CRON SYSTEM FIXED: Updated functions, reset schedules, improved timing (no net dependency)', NOW());
  END IF;
END $$;