-- ============================================================================
-- WEB-SEC-021: Close anonymous SELECT on internal operational tables
-- ============================================================================
-- An unauthenticated visitor holding the anon key that ships in the client
-- bundle can currently enumerate the anti-abuse blocklist, the complete RBAC
-- model, the internal ad pricing algorithm, and the name of every AI secret.
-- Probed against production 2026-08-11 (counts only, never contents):
--
--   blocked_email_domains    5,361 rows   an anti-abuse control that only works
--                                         while it is not public
--   permission_definitions      58        the full permission vocabulary
--   role_permissions           166        the complete role -> permission map
--   role_definitions             4
--   pricing_rules                3        base_price + traffic/demand
--                                         multipliers + min/max price
--   ai_environment_config        9        names of every AI secret and its
--                                         Coolify variable (no values today)
--
-- CALL-PATH VERIFICATION (2026-08-19), grepping the web client (src/), both
-- shipped mobile apps (ios/, android/), the edge functions (supabase/functions/)
-- and scripts/ for every one of these table names:
--
--   permission_definitions  -> NO call site anywhere
--   role_permissions        -> NO call site anywhere
--   role_definitions        -> NO call site anywhere
--   pricing_rules           -> NO call site anywhere
--   ai_environment_config   -> NO call site anywhere
--   blocked_email_domains   -> src/components/admin/BlockedEmailDomainsManager.tsx
--                              (admin panel, authenticated admin session) and
--                              src/hooks/useAuthSecurity.ts, which does NOT read
--                              the table - it calls the is_email_domain_blocked
--                              RPC, SECURITY DEFINER with search_path pinned and
--                              EXECUTE granted to anon
--                              (20260410000001_create_blocked_email_domains.sql:
--                              113-147). Signup validation keeps working with the
--                              table closed.
--
-- Because no anon caller exists in either client, dropping the anon grant cannot
-- break a shipped binary. CLAUDE.md forbids tightening an RLS policy in a way
-- that would deny reads an older client expects to succeed; no older client
-- makes these reads. This is the same shape as
-- 20260711000030_scope_down_anon_security_rpc_grants.sql.
--
-- MECHANISM: policy AND grant. A permissive policy is what exposes these today,
-- but revoking the table-level SELECT grant from anon is the durable half - a
-- future "Anyone can view ..." policy added by hand in the dashboard cannot
-- re-expose the table while the grant is gone. `authenticated` grants are left
-- untouched (minimal blast radius, matching the precedent migration).
--
-- NOT IN SCOPE, deliberately, and still open on WEB-SEC-021:
--   feature_flags   -- read by anonymous clients (src/hooks/useFeatureFlag.ts,
--                      useExperiment.ts). Needs per-flag scoping or server-side
--                      evaluation, not a blanket revoke.
--   content_metrics, image_optimization_queue, media_assets
--                   -- all three carry client write paths (useContentTracking,
--                      useMediaUpload, useMediaLibrary). AC6 asks whether anon
--                      read is intended; that is a decision, not a revoke.
--
-- AFTER APPLYING: re-run `npx tsx scripts/check-anon-exposure.ts` and then
-- `--update` to drop these six out of anon-exposure-baseline.json. The baseline
-- is deliberately NOT edited here - the ratchet fails on a newly-exposed table,
-- so removing a still-exposed entry ahead of the deploy turns CI red.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. blocked_email_domains (AC1) - admin-only read; signup goes via the RPC
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Blocked email domains are publicly readable"
  ON public.blocked_email_domains;

DROP POLICY IF EXISTS "Admins can view blocked email domains"
  ON public.blocked_email_domains;

CREATE POLICY "Admins can view blocked email domains"
  ON public.blocked_email_domains
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'root_admin')
    )
  );

REVOKE SELECT ON public.blocked_email_domains FROM anon;

-- ----------------------------------------------------------------------------
-- 2. RBAC model (AC2) - authenticated-only read
-- ----------------------------------------------------------------------------
-- 20260128000001_security_layers.sql:434-436, 452-454 and 469-471 created these
-- as `USING (true)` with no TO clause, so anon reads them. No client reads them
-- at all; scoping to `authenticated` is the smallest change that closes the
-- anon hole without guessing at a future admin surface.

DROP POLICY IF EXISTS "Anyone can view role definitions" ON public.role_definitions;
DROP POLICY IF EXISTS "Authenticated users can view role definitions" ON public.role_definitions;

CREATE POLICY "Authenticated users can view role definitions"
  ON public.role_definitions
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.role_definitions FROM anon;

DROP POLICY IF EXISTS "Anyone can view permission definitions" ON public.permission_definitions;
DROP POLICY IF EXISTS "Authenticated users can view permission definitions" ON public.permission_definitions;

CREATE POLICY "Authenticated users can view permission definitions"
  ON public.permission_definitions
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.permission_definitions FROM anon;

DROP POLICY IF EXISTS "Anyone can view role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON public.role_permissions;

CREATE POLICY "Authenticated users can view role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.role_permissions FROM anon;

-- ----------------------------------------------------------------------------
-- 3. pricing_rules (AC3) and ai_environment_config (AC5)
-- ----------------------------------------------------------------------------
-- Neither table is created by any migration in this repo - both were made
-- outside the migration history, so their policy names are not knowable here.
-- The table-level grant is the lever that works regardless of policy name:
-- without SELECT, PostgREST rejects the anon request whatever the policies say.
-- Guarded so this migration is a no-op where the table is absent.
--
-- ad_rate_card and advertising_packages are left public on purpose - AC3 flags
-- them as probably intentional for the Advertise page, and they are read by the
-- client. Only the internal multipliers close.

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY['pricing_rules', 'ai_environment_config'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', tbl);
      RAISE NOTICE 'WEB-SEC-021: revoked anon SELECT on public.%', tbl;
    ELSE
      RAISE NOTICE 'WEB-SEC-021: public.% not present, skipped', tbl;
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 4. Keep the default-privilege drift from re-granting these
-- ----------------------------------------------------------------------------
-- Supabase's bootstrap runs GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon.
-- That is a one-shot grant over tables that existed at the time, so it does not
-- silently undo the REVOKEs above, but a future bulk re-grant would. The
-- anon-exposure ratchet in .github/workflows/rls-config-audit.yml is the control
-- that catches it: it probes live rather than parsing migrations, so a re-grant
-- shows up as a newly anon-readable table on the next run.

COMMENT ON TABLE public.blocked_email_domains IS
  'Anti-abuse email-domain blocklist. NOT anon-readable (WEB-SEC-021): a public blocklist is a defeated blocklist. Signup validation calls the is_email_domain_blocked SECURITY DEFINER RPC instead of reading this table.';
