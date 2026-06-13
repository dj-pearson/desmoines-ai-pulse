-- WEB-SEC-003: Lock down client writes to public.user_roles.
--
-- Role escalation must be impossible from the browser. All sanctioned role
-- changes now go through the `assign-role` edge function (service role, which
-- bypasses RLS). This migration is ADDITIVE and backward-compatible:
--   * iOS/Android binaries never write user_roles (verified), so denying
--     authenticated/anon writes breaks no shipped client.
--   * The web admin write path is migrated to the edge function in the same
--     release (src/hooks/useUserRole.ts assignRole).
--   * Reads are preserved: a permissive SELECT policy keeps own-row + admin
--     reads working (and permissive policies only ADD access, never remove it).
--
-- RESTRICTIVE write policies are used deliberately: they are AND-ed with any
-- pre-existing permissive policy, so even if a permissive INSERT/UPDATE/DELETE
-- policy exists (e.g. created out-of-band), these still deny the write. The
-- service_role used by edge functions has BYPASSRLS and is unaffected.

-- Ensure RLS is on (idempotent — no-op if already enabled).
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- --- Reads: own row OR admin (additive permissive policy) -------------------
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own_or_admin"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- --- Writes: deny for authenticated + anon (restrictive) --------------------
DROP POLICY IF EXISTS "user_roles_deny_client_insert" ON public.user_roles;
CREATE POLICY "user_roles_deny_client_insert"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "user_roles_deny_client_update" ON public.user_roles;
CREATE POLICY "user_roles_deny_client_update"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "user_roles_deny_client_delete" ON public.user_roles;
CREATE POLICY "user_roles_deny_client_delete"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);

COMMENT ON TABLE public.user_roles IS
  'Role assignments. Client writes are denied by RLS — use the assign-role edge function (service role) which verifies caller admin status and writes an audit log. See WEB-SEC-003.';
