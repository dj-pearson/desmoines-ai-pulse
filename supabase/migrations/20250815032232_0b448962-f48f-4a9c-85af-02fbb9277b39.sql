-- Fix the cron system to actually trigger scraping jobs instead of just scheduling them
-- Update the cron job to directly call the scrape-events function for jobs that are due

-- First, let's unschedule the old job
SELECT cron.unschedule('scraping-jobs-runner-simple');

-- Create a new enhanced cron job that actually triggers the jobs
SELECT cron.schedule(
  'scraping-jobs-auto-trigger',
  '*/15 * * * *', -- Every 15 minutes
  $$
  DO $$
  DECLARE
    job_record RECORD;
    function_url TEXT;
    http_response_id BIGINT;
  BEGIN
    -- Set the function URL
    function_url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events';
    
    -- Log the cron execution
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔄 Auto-trigger cron job started', NOW());
    
    -- Find jobs that are due to run (either scheduled_for_trigger or overdue)
    FOR job_record IN 
      SELECT * FROM public.scraping_jobs 
      WHERE (status = 'scheduled_for_trigger' OR (status = 'idle' AND next_run <= NOW()))
        AND (config->>'isActive')::boolean = true
    LOOP
      -- Update job status to running
      UPDATE public.scraping_jobs 
      SET status = 'running', updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Trigger the scrape-events function directly
      BEGIN
        SELECT net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'x-trigger-source', 'cron'
          ),
          body := jsonb_build_object(
            'jobId', job_record.id,
            'triggerSource', 'cron-auto-trigger'
          )::text
        ) INTO http_response_id;
        
        -- Calculate next run time based on schedule
        UPDATE public.scraping_jobs 
        SET 
          status = 'idle',
          last_run = NOW(),
          next_run = CASE 
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
            ELSE NOW() + INTERVAL '6 hours' -- Default fallback
          END,
          updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log successful trigger
        INSERT INTO public.cron_logs (message, job_id, created_at) 
        VALUES ('✅ Auto-triggered job: ' || job_record.name || ' (HTTP ID: ' || http_response_id || ')', job_record.id, NOW());
        
      EXCEPTION WHEN OTHERS THEN
        -- Reset job status on error
        UPDATE public.scraping_jobs 
        SET status = 'idle', next_run = NOW() + INTERVAL '1 hour', updated_at = NOW()
        WHERE id = job_record.id;
        
        -- Log the error
        INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
        VALUES ('❌ Failed to trigger job: ' || job_record.name, job_record.id, SQLERRM, NOW());
      END;
    END LOOP;
    
    -- Log completion
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔄 Auto-trigger cron job completed', NOW());
    
  END $$;
  $$
);