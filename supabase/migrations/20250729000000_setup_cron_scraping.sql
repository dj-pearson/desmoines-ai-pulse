-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant necessary permissions for cron jobs
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a function to run scraping jobs
CREATE OR REPLACE FUNCTION run_scraping_jobs()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  next_run_time TIMESTAMPTZ;
  response_body TEXT;
  function_url TEXT;
BEGIN
  -- Get the Supabase project URL (you'll need to replace this with your actual URL)
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
        WHEN job_record.config->>'schedule' = '0 6 * * *' THEN NOW() + INTERVAL '1 day'
        ELSE NOW() + INTERVAL '6 hours' -- Default to 6 hours
      END;
      
      -- Call the scrape-events function via HTTP
      -- Note: This is a simplified approach. In production, you might want to use a more robust method
      PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT vault.get_secret('SUPABASE_SERVICE_ROLE_KEY'))
        ),
        body := jsonb_build_object(
          'jobId', job_record.id,
          'triggerSource', 'cron'
        )
      );
      
      -- Update the next run time
      UPDATE public.scraping_jobs 
      SET next_run = next_run_time, updated_at = NOW()
      WHERE id = job_record.id;
      
      -- Log successful job trigger
      INSERT INTO public.cron_logs (message, job_id, created_at) 
      VALUES ('Successfully triggered scraping job: ' || job_record.name, job_record.id, NOW());
      
    EXCEPTION WHEN OTHERS THEN
      -- Log the error and reset job status
      INSERT INTO public.cron_logs (message, job_id, error_details, created_at) 
      VALUES (
        'Error triggering scraping job: ' || job_record.name, 
        job_record.id,
        SQLERRM,
        NOW()
      );
      
      -- Reset job status to idle so it can be retried
      UPDATE public.scraping_jobs 
      SET status = 'idle', updated_at = NOW()
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

-- Create cron_logs table to track cron execution
CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  job_id UUID REFERENCES public.scraping_jobs(id),
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on cron_logs
ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for cron_logs (admin access only)
CREATE POLICY "Admin access for cron_logs" ON public.cron_logs 
FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create index for better performance
CREATE INDEX idx_cron_logs_created_at ON public.cron_logs(created_at DESC);

-- Schedule the cron job to run every 30 minutes
SELECT cron.schedule(
  'scraping-jobs-runner',
  '*/30 * * * *', -- Every 30 minutes
  'SELECT run_scraping_jobs();'
);

-- Update existing scraping jobs to have proper next_run times
UPDATE public.scraping_jobs 
SET next_run = CASE 
  WHEN config->>'schedule' = '0 */6 * * *' THEN NOW() + INTERVAL '6 hours'
  WHEN config->>'schedule' = '0 */3 * * *' THEN NOW() + INTERVAL '3 hours'
  WHEN config->>'schedule' = '0 */8 * * *' THEN NOW() + INTERVAL '8 hours'
  WHEN config->>'schedule' = '0 */12 * * *' THEN NOW() + INTERVAL '12 hours'
  WHEN config->>'schedule' = '0 6 * * *' THEN 
    CASE 
      WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN DATE_TRUNC('day', NOW()) + INTERVAL '6 hours'
      ELSE DATE_TRUNC('day', NOW()) + INTERVAL '1 day 6 hours'
    END
  ELSE NOW() + INTERVAL '6 hours'
END,
config = config || jsonb_build_object('isActive', true)
WHERE next_run IS NULL OR (config->>'isActive') IS NULL;
