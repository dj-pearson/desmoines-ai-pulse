-- Verify Cron System Status
-- Run this script in your Supabase SQL Editor to check if the cron system is working

-- Check if pg_cron extension is enabled
SELECT 'Extension Status:' as check_type, 
  CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') 
    THEN 'pg_cron extension is enabled ✅' 
    ELSE 'pg_cron extension is NOT enabled ❌' 
  END as status;

-- Check active cron jobs
SELECT 'Active Cron Jobs:' as check_type;
SELECT 
  jobname as job_name,
  schedule,
  active,
  command,
  CASE WHEN active THEN '✅ Active' ELSE '❌ Inactive' END as status
FROM cron.job 
WHERE jobname = 'scraping-jobs-runner';

-- Check scraping jobs configuration
SELECT 'Scraping Jobs Status:' as check_type;
SELECT 
  id,
  name,
  status,
  next_run,
  last_run,
  events_found,
  config->>'schedule' as schedule,
  config->>'isActive' as is_active,
  CASE 
    WHEN next_run <= NOW() THEN '🔴 Overdue'
    WHEN next_run <= NOW() + INTERVAL '1 hour' THEN '🟡 Due Soon'
    ELSE '🟢 Scheduled'
  END as run_status
FROM public.scraping_jobs 
ORDER BY next_run ASC;

-- Check recent cron logs
SELECT 'Recent Cron Logs:' as check_type;
SELECT 
  created_at,
  message,
  job_id,
  error_details,
  CASE 
    WHEN error_details IS NULL THEN '✅ Success'
    ELSE '❌ Error'
  END as result
FROM public.cron_logs 
ORDER BY created_at DESC 
LIMIT 10;

-- Show next expected cron run
SELECT 'Next Cron Execution:' as check_type;
SELECT 
  'scraping-jobs-runner' as job_name,
  'Every 30 minutes' as frequency,
  EXTRACT(MINUTE FROM NOW()) as current_minute,
  CASE 
    WHEN EXTRACT(MINUTE FROM NOW()) % 30 = 0 THEN 'Running now!'
    ELSE (30 - (EXTRACT(MINUTE FROM NOW())::int % 30)) || ' minutes until next run'
  END as next_run_info;

-- Manual test function (you can call this to test the system)
SELECT 'Manual Test:' as check_type;
SELECT 'To manually test the cron system, run: SELECT run_scraping_jobs();' as instruction;

-- Summary report
SELECT 'System Summary:' as check_type;
SELECT 
  COUNT(*) as total_scraping_jobs,
  COUNT(*) FILTER (WHERE (config->>'isActive')::boolean = true) as active_jobs,
  COUNT(*) FILTER (WHERE status = 'running') as currently_running,
  COUNT(*) FILTER (WHERE next_run <= NOW()) as overdue_jobs
FROM public.scraping_jobs;
