-- WEB-SEC-081: eight views created after 20260511000000_fix_security_lints.sql
-- run with their owner's rights, so they skip the admin-only RLS on the tables
-- underneath them.
--
-- A Postgres view checks permissions and RLS as the view's OWNER unless
-- security_invoker is on. The owner here is the migration role, which RLS does
-- not stop, and Supabase's default privileges grant every new view to anon
-- and authenticated. So anyone holding the anon key could read, for example,
-- GET /rest/v1/agent_tasks_overdue?select=* and get whole agent_tasks rows,
-- payload included (fraud evidence from fraud-abuse-detector, lead enrichment
-- from lead-enrichment). The 2026-05-11 migration fixed the seven views that
-- existed then; nothing fixed the ones written afterwards, and
-- 20260520000006 granted social_accounts_admin to authenticated on the wrong
-- premise that views run as the invoker by default.
--
-- After this migration each view runs as the caller, so the tables' own
-- policies decide:
--
--   view                     underlying tables (SELECT policy)
--   social_accounts_admin    social_accounts (service_role only)
--   automation_job_health    automation_job_runs (is_admin())
--   agent_run_summary        agent_registry, automation_job_runs (admin)
--   agent_tasks_overdue      agent_tasks (admin via user_roles)
--   agent_month_spend        agent_registry, automation_job_runs (admin)
--   agent_quality_summary    agent_quality_scores (admin via user_roles)
--   provider_spend_mtd       provider_budgets, provider_usage, agent_registry,
--                            automation_job_runs (admin)
--   user_lifecycle_summary   profiles ("Admins can view all profiles", plus
--                            each user's own row)
--
-- Readers, checked 2026-11-22:
--   - Admin UI (signed-in admin, authenticated role): JobHealthPanel reads
--     automation_job_health; useAgentControlPlane / useAgentTasks read
--     agent_run_summary, agent_quality_summary, agent_month_spend;
--     useProviderCosts reads provider_spend_mtd; useLifecycle reads
--     user_lifecycle_summary. The same admin already reads agent_tasks,
--     automation_job_runs and agent_registry directly from those hooks, so
--     the admin policies are known to pass for them.
--   - Edge functions (service role, bypasses RLS): manage-social-account
--     reads social_accounts_admin, api-cost-watchdog reads provider_spend_mtd,
--     agentRuntime reads agent_month_spend. Unaffected.
--   - No anon reader and no ios/ or android/ reader of any of the eight.
--
-- One consequence to know about: user_lifecycle_summary read by a NON-admin
-- now counts only that user's own profile row instead of every user. No
-- non-admin screen reads it.
--
-- Grants: anon loses everything on the eight views; authenticated keeps
-- SELECT only. Several of these views are simple enough to be auto-updatable
-- (agent_tasks_overdue is `SELECT t.*`), so the default ALL grant also let a
-- caller UPDATE agent_tasks through the view. Nothing writes through them.
--
-- TRAP FOR THE NEXT EDIT: CREATE OR REPLACE VIEW resets the view's options.
-- Redefining any of these views without `WITH (security_invoker = on)` turns
-- this fix off again. scripts/check-view-security-invoker.mjs fails on that.

ALTER VIEW public.social_accounts_admin  SET (security_invoker = on);
ALTER VIEW public.automation_job_health  SET (security_invoker = on);
ALTER VIEW public.agent_run_summary      SET (security_invoker = on);
ALTER VIEW public.agent_tasks_overdue    SET (security_invoker = on);
ALTER VIEW public.agent_month_spend      SET (security_invoker = on);
ALTER VIEW public.agent_quality_summary  SET (security_invoker = on);
ALTER VIEW public.provider_spend_mtd     SET (security_invoker = on);
ALTER VIEW public.user_lifecycle_summary SET (security_invoker = on);

REVOKE ALL ON public.social_accounts_admin  FROM anon, authenticated;
REVOKE ALL ON public.automation_job_health  FROM anon, authenticated;
REVOKE ALL ON public.agent_run_summary      FROM anon, authenticated;
REVOKE ALL ON public.agent_tasks_overdue    FROM anon, authenticated;
REVOKE ALL ON public.agent_month_spend      FROM anon, authenticated;
REVOKE ALL ON public.agent_quality_summary  FROM anon, authenticated;
REVOKE ALL ON public.provider_spend_mtd     FROM anon, authenticated;
REVOKE ALL ON public.user_lifecycle_summary FROM anon, authenticated;

GRANT SELECT ON public.social_accounts_admin  TO authenticated;
GRANT SELECT ON public.automation_job_health  TO authenticated;
GRANT SELECT ON public.agent_run_summary      TO authenticated;
GRANT SELECT ON public.agent_tasks_overdue    TO authenticated;
GRANT SELECT ON public.agent_month_spend      TO authenticated;
GRANT SELECT ON public.agent_quality_summary  TO authenticated;
GRANT SELECT ON public.provider_spend_mtd     TO authenticated;
GRANT SELECT ON public.user_lifecycle_summary TO authenticated;

COMMENT ON VIEW public.social_accounts_admin IS
  'Token-free shape of social_accounts (WEB-SEC-081: security_invoker). Runs with the caller''s rights, and social_accounts is service_role-only, so only the manage-social-account edge function (service role) gets rows. A signed-in user reading it directly gets [].';

-- Eleven older views from migrations before 2026-05-11 never had
-- security_invoker either: none of them is in the production snapshot
-- (scripts/db-snapshot.json, 2026-08-24), which is why the 2026-05-11 linter
-- run did not list them. They are created on a fresh database built from these
-- migrations, so IF EXISTS sets the option there and is a no-op in production.
ALTER VIEW IF EXISTS public.v_gsc_recent_keywords        SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_gsc_recent_pages           SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_latest_core_web_vitals     SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_pages_with_critical_issues SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_unhealthy_redirects        SET (security_invoker = on);
ALTER VIEW IF EXISTS public.locations_needing_geocoding  SET (security_invoker = on);
ALTER VIEW IF EXISTS public.crm_contact_summary          SET (security_invoker = on);
ALTER VIEW IF EXISTS public.crm_deal_pipeline            SET (security_invoker = on);
ALTER VIEW IF EXISTS public.crm_activity_feed            SET (security_invoker = on);
ALTER VIEW IF EXISTS public.billing_history              SET (security_invoker = on);
ALTER VIEW IF EXISTS public.usage_summary                SET (security_invoker = on);
