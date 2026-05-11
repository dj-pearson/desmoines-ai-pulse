-- ============================================================================
-- Migration: Fix Supabase database linter security errors
-- Date: 2026-05-11
-- ============================================================================
-- Addresses these lint codes (all level=ERROR, facing=EXTERNAL):
--   - 0010 security_definer_view ......... 7 views
--   - 0013 rls_disabled_in_public ........ 11 tables
--   - 0007 policy_exists_rls_disabled .... content_queue (policies exist
--                                          but RLS wasn't turned on)
--
-- Approach:
--   - Views: switch to SECURITY INVOKER so they use the caller's permissions.
--     Underlying tables enforce RLS, so callers only see what they're entitled
--     to. No behavior change for admins (who can already read everything).
--   - Admin tables: ENABLE RLS + add FOR ALL policy gated on is_admin().
--     service_role bypasses RLS automatically, so edge functions keep working.
--   - System tables (logs, archives): ENABLE RLS with NO policies — these are
--     intentionally inaccessible to anon/authenticated; only service_role
--     reads/writes them.
--   - spatial_ref_sys: ENABLE RLS with public SELECT (PostGIS reference data,
--     not sensitive). Wrapped in a DO block in case the table is owned by
--     postgres and the migration role lacks ALTER privilege.
-- ============================================================================


-- Section 1: SECURITY DEFINER views → SECURITY INVOKER ----------------------

ALTER VIEW public.restaurant_quality_stats         SET (security_invoker = on);
ALTER VIEW public.v_broken_links_summary           SET (security_invoker = on);
ALTER VIEW public.v_semantic_opportunities         SET (security_invoker = on);
ALTER VIEW public.v_high_priority_content_issues   SET (security_invoker = on);
ALTER VIEW public.analytics_dashboard_summary      SET (security_invoker = on);
ALTER VIEW public.v_duplicate_content_summary      SET (security_invoker = on);
ALTER VIEW public.v_content_optimization_dashboard SET (security_invoker = on);


-- Section 2: content_queue — RLS off but policies already exist -------------

ALTER TABLE public.content_queue ENABLE ROW LEVEL SECURITY;


-- Section 3: Admin-only configuration tables --------------------------------

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to import_jobs" ON public.import_jobs;
CREATE POLICY "Admin full access to import_jobs"
  ON public.import_jobs FOR ALL USING (is_admin());

ALTER TABLE public.oauth_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to oauth_providers" ON public.oauth_providers;
CREATE POLICY "Admin full access to oauth_providers"
  ON public.oauth_providers FOR ALL USING (is_admin());

ALTER TABLE public.auto_approval_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to auto_approval_rules" ON public.auto_approval_rules;
CREATE POLICY "Admin full access to auto_approval_rules"
  ON public.auto_approval_rules FOR ALL USING (is_admin());

ALTER TABLE public.data_quality_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to data_quality_scans" ON public.data_quality_scans;
CREATE POLICY "Admin full access to data_quality_scans"
  ON public.data_quality_scans FOR ALL USING (is_admin());

ALTER TABLE public.hotel_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to hotel_areas" ON public.hotel_areas;
CREATE POLICY "Admin full access to hotel_areas"
  ON public.hotel_areas FOR ALL USING (is_admin());

ALTER TABLE public.ai_model_configurations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access to ai_model_configurations" ON public.ai_model_configurations;
CREATE POLICY "Admin full access to ai_model_configurations"
  ON public.ai_model_configurations FOR ALL USING (is_admin());


-- Section 4: System / internal-only tables ----------------------------------
-- No policies. Reachable only via service_role (which bypasses RLS).

ALTER TABLE public.archived_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs    ENABLE ROW LEVEL SECURITY;


-- Section 5: PostGIS reference data -----------------------------------------
-- spatial_ref_sys may be owned by `postgres` and altering it can require
-- elevated privilege. Wrap in a guarded block so failure here doesn't break
-- the whole migration — the lint warning is acceptable on this system table
-- if we can't ALTER it.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Public read access to spatial_ref_sys" ON public.spatial_ref_sys';
    EXECUTE 'CREATE POLICY "Public read access to spatial_ref_sys" '
         || 'ON public.spatial_ref_sys FOR SELECT USING (true)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping spatial_ref_sys RLS — insufficient privilege (acceptable for PostGIS system table)';
  END;
END $$;
