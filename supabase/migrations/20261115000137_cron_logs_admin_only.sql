-- WEB-SEC-077: cron_logs is readable by admins only and writable by
-- nobody but the service role and the SECURITY DEFINER jobs that log to it.
--
-- WHAT WAS WRONG. 20251123000000_setup_cron_scraping.sql gave cron_logs the
-- policy "Admin access for cron_logs", FOR ALL with the condition
--
--     auth.role() = 'authenticated' OR auth.role() = 'service_role'
--
-- under the comment "admin access only". (Not quoted as a statement: the
-- offline policy parsers read comments too.) auth.role() is 'authenticated' for
-- every signed-in account, so anyone who signs up could, with the bundled
-- anon key and their own session:
--   read    every row, including error_details (raw scraper and job errors);
--   insert  rows the admin pages trust: useSystemMonitoring reports "uptime"
--           from the newest row and AIEnhancementManager shows the last bulk
--           enhancement run from a message ILIKE '%AI bulk enhancement%', so a
--           forged row makes a dead cron look healthy;
--   update  or delete rows, which hides real failures.
-- The admin read added in 20251110000011 ("Admins can view cron logs",
-- is_admin_or_root()) never narrowed anything, because policies are OR'd.
--
-- WRITERS, enumerated 2026-11-15. Every function that writes cron_logs in its
-- newest definition is SECURITY DEFINER (run_scraping_jobs 20260902000005,
-- run_scraping_jobs_simple, trigger_due_scraping_jobs, purge_old_events,
-- optimize_database_performance, run_social_media_automation,
-- run_social_media_publishing), and runs as the table owner, which RLS does
-- not apply to (the table is not FORCE ROW LEVEL SECURITY). The one edge
-- writer, bulk-enhance-events, inserts with the service role key. None of
-- them needs a policy.
--
-- READERS. Web: AIEnhancementManager (AdminAI) and useSystemMonitoring
-- (AdminSystem), both admin pages, both covered by the admin read that stays.
-- iOS and Android: no reference. No view or invoker function reads it.
--
-- BACKWARD COMPATIBILITY. This tightens RLS, which CLAUDE.md allows in one
-- release only when no shipped client expects the denied access. The only
-- access removed is non-admin read/write and admin write, and no client,
-- shipped or not, does either. Single release.

DROP POLICY IF EXISTS "Admin access for cron_logs" ON public.cron_logs;

-- The admin read from 20251110000011, restated with TO authenticated so anon
-- requests stop evaluating it. Same predicate, same admins.
DROP POLICY IF EXISTS "Admins can view cron logs" ON public.cron_logs;
CREATE POLICY "Admins can view cron logs"
  ON public.cron_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_root());
