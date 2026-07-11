-- ============================================================================
-- WEB-DB-001: Pin search_path on is_admin() and all SECURITY DEFINER functions
-- WEB-DB-002: Close the profiles.role self-escalation gap
-- ============================================================================
-- SECURITY DEFINER functions run with the owner's privileges. Without a pinned
-- search_path, a caller who can create objects in a schema earlier on the
-- search path (or influence it) can shadow the tables/functions the definer
-- body references — a privilege-escalation surface. is_admin() gates admin RLS,
-- so this is load-bearing.
--
-- This migration is fully additive and backward compatible:
--   * is_admin() is CREATE OR REPLACE'd with the same body + SET search_path.
--   * Every other public SECURITY DEFINER function missing a pinned search_path
--     is fixed via ALTER FUNCTION ... SET search_path (no body/signature change).
--   * validate_profile_user_id() gains a guard on profiles.role to match the
--     existing profiles.user_role guard, closing the self-escalation path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. is_admin(): pin search_path (matches sibling user_has_role_or_higher()).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- First check user_roles table
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Fall back to profiles table (user_role column)
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND user_role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Also check profiles.role for backwards compatibility. This column is now
  -- write-guarded by validate_profile_user_id() (WEB-DB-002) so a non-admin
  -- can no longer self-assign it.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Checks if the current user is an admin by looking at user_roles and profiles tables. search_path pinned (WEB-DB-001).';

-- ----------------------------------------------------------------------------
-- 2. Pin search_path on every other public SECURITY DEFINER function that
--    lacks one. ALTER FUNCTION ... SET is additive: no body/signature change.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
        r.proname, r.args
      );
      RAISE NOTICE 'Pinned search_path on public.%(%)', r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      -- Never abort the whole migration for one un-alterable function.
      RAISE WARNING 'Could not pin search_path on public.%(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. WEB-DB-002: also block non-admins from setting/raising profiles.role.
--    Mirrors the existing profiles.user_role guard. Wrapped for environments
--    where the profiles table/user_role type may not exist yet.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    CREATE OR REPLACE FUNCTION public.validate_profile_user_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $func$
    BEGIN
      -- Only allow users to create/modify profiles for themselves (unless admin)
      IF NEW.user_id != auth.uid() AND NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
        RAISE EXCEPTION 'Users can only create profiles for themselves';
      END IF;

      -- Prevent unauthorized role escalation via the user_role column
      IF NEW.user_role IS NOT NULL AND NEW.user_role != 'user' THEN
        IF NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
          RAISE EXCEPTION 'Only administrators can assign non-user roles';
        END IF;
      END IF;

      -- WEB-DB-002: prevent self-escalation via the legacy profiles.role column,
      -- which is_admin() still trusts. Only guard an actual change to a
      -- non-'user' value so ordinary self-updates (name, avatar, etc.) still pass.
      IF NEW.role IS NOT NULL
         AND NEW.role::text NOT IN ('user', '')
         AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
        IF NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
          RAISE EXCEPTION 'Only administrators can assign non-user roles (profiles.role)';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $func$;

    DROP TRIGGER IF EXISTS validate_profile_user_id ON public.profiles;
    CREATE TRIGGER validate_profile_user_id
      BEFORE INSERT OR UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.validate_profile_user_id();
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_object OR undefined_column THEN
    -- Dependencies (user_role type, role column) not present yet — skip.
    NULL;
END $$;
