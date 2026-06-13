-- WEB-SEC-005: RLS audit fixes (see docs/RLS_AUDIT.md).
--
-- Two unambiguous, backward-compatible fixes. Ambiguous findings are left in
-- the report's "Needs human decision" section rather than fixed blind.

-- ===========================================================================
-- FIX 1: Scope accidentally-public "service role" policies to service_role.
--
-- These policies are named "Service role can manage …" but were written
-- `FOR ALL USING (true) WITH CHECK (true)` with NO role restriction, so they
-- defaulted to PUBLIC — granting every authenticated (and anon) caller full
-- read+write on payments, invoices, subscriptions and usage. The permissive
-- policy is OR-ed with the proper per-user SELECT policies, so it silently
-- nullified them.
--
-- Safe to tighten now (CLAUDE.md):
--   * service_role BYPASSES RLS, so backend writes (Stripe webhooks, edge
--     functions) are unaffected — these policies were redundant for it anyway.
--   * Legitimate user READS are served by the separate "Users can view own …"
--     policies, which remain.
--   * No shipped web/iOS/Android client writes these tables directly, so no
--     binary relies on the over-grant being removed.
-- We recreate them scoped to service_role to keep the documented intent.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'user_subscriptions:Service role can manage all subscriptions',
    'payments:Service role can manage all payments',
    'invoices:Service role can manage all invoices',
    'usage_events:Service role can manage all usage events',
    'usage_quotas:Service role can manage usage quotas',
    'pseo_pages:Service role full access to pseo pages',
    'pseo_generation_queue:Service role full access queue',
    'pseo_generation_log:Service role full access log'
  ];
  parts text[];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    parts := string_to_array(t, ':');
    -- Drop the over-permissive policy if present.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', parts[2], parts[1]);
    -- Recreate scoped to service_role (explicit intent; service_role also
    -- bypasses RLS so this is belt-and-suspenders).
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      parts[2], parts[1]
    );
  END LOOP;
END $$;

-- ===========================================================================
-- FIX 2: Pin search_path on every SECURITY DEFINER function in `public` that
-- isn't already pinned.
--
-- A SECURITY DEFINER function without a pinned search_path can be hijacked via
-- a caller-controlled search_path (the function resolves unqualified names in
-- the attacker's schema while running with the definer's privileges). Pinning
-- to `public, pg_temp` is additive and preserves behaviour (these functions
-- were written assuming the public schema). Done by OID via regprocedure so
-- overloads are handled automatically and no function is missed.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg ILIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;
