-- WEB-SEC-021 ACs 1, 2, 3 and 5: stop publishing internal tables to the anon key.
--
-- Every table below was readable by the anon key that ships in the client
-- bundle. Re-probed against production 2026-08-22, counts only:
--   blocked_email_domains    5,361     the anti-abuse blocklist itself
--   permission_definitions      58     the RBAC model
--   role_permissions           166     the RBAC model
--   role_definitions             4     the RBAC model
--   pricing_rules                3     internal ad pricing multipliers
--   ai_environment_config        9     the name of every AI secret
--
-- ai_environment_config IS WORSE THAN THE STORY RECORDED. Its only policy was
--   "Allow all for ai_environment_config"  cmd=ALL  roles={public}  USING (true)
-- ALL, not SELECT. Verified as the anon role inside a rolled-back transaction:
--   SET LOCAL ROLE anon;
--   INSERT INTO public.ai_environment_config ... -> INSERT 0 1
--   UPDATE public.ai_environment_config ...      -> UPDATE 10
--   DELETE FROM public.ai_environment_config ... -> DELETE 1
-- So anyone holding the anon key could rewrite or delete the AI configuration,
-- not merely read it. That is closed here along with the read.
--
-- WHY THIS TIGHTENING IS SAFE IN ONE RELEASE (CLAUDE.md normally forbids it)
-- The rule exists to protect reads a shipped client expects to succeed. Checked
-- per table rather than assumed:
--   * NO shipped mobile binary touches any of them. grep over ios/ and android/
--     returns zero references for all six.
--   * blocked_email_domains: the client NEVER reads the table. useAuthSecurity
--     .ts:113 calls the is_email_domain_blocked RPC, which is SECURITY DEFINER
--     (prosecdef = t) and therefore unaffected by this policy. Verified as anon
--     after the change, below. The blocklist stays ENFORCEABLE but stops being
--     ENUMERABLE, which is the entire point of AC1.
--   * permission_definitions / role_permissions / role_definitions: no runtime
--     reader at all. The only hits are src/integrations/supabase/types.ts, which
--     is generated types, and the migration that created them.
--   * pricing_rules: no reader anywhere in src/, supabase/functions/, ios/ or
--     android/. The single hit is a comment in scripts/check-anon-exposure.ts.
--   * ai_environment_config: no reader anywhere.
-- Admin surfaces keep their access: BlockedEmailDomainsManager.tsx runs as an
-- authenticated admin and is matched by the new policies below.
--
-- Each new SELECT policy reuses the gate that table's own WRITE policy already
-- uses, rather than inventing a new one.
--
-- feature_flags, content_metrics, media_assets and image_optimization_queue are
-- deliberately NOT touched here. They have live client readers (useFeatureFlag,
-- useExperiment, useContentTracking, useMediaLibrary, useMediaUpload) and need
-- the per-flag / per-row treatment AC4 and AC6 describe, which is a design
-- decision rather than a revoke.

-- AC1 -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Blocked email domains are publicly readable" ON public.blocked_email_domains;

CREATE POLICY "Admins can view blocked email domains"
  ON public.blocked_email_domains
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

-- AC2 -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view permission definitions" ON public.permission_definitions;

CREATE POLICY "Admins can view permission definitions"
  ON public.permission_definitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

DROP POLICY IF EXISTS "Anyone can view role permissions" ON public.role_permissions;

CREATE POLICY "Admins can view role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

DROP POLICY IF EXISTS "Anyone can view role definitions" ON public.role_definitions;

CREATE POLICY "Admins can view role definitions"
  ON public.role_definitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::user_role, 'root_admin'::user_role])
    )
  );

-- AC3 -----------------------------------------------------------------------
-- The existing write policy uses user_has_role_or_higher, so the read matches it.
DROP POLICY IF EXISTS "Anyone can view active pricing rules" ON public.pricing_rules;

CREATE POLICY "Admins can view pricing rules"
  ON public.pricing_rules
  FOR SELECT
  TO authenticated
  USING (public.user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- AC5 -----------------------------------------------------------------------
-- Replaces the ALL/public/true policy outright, closing the write hole with it.
DROP POLICY IF EXISTS "Allow all for ai_environment_config" ON public.ai_environment_config;

CREATE POLICY "Admins can manage ai environment config"
  ON public.ai_environment_config
  FOR ALL
  TO authenticated
  USING (public.user_has_role_or_higher(auth.uid(), 'admin'::user_role))
  WITH CHECK (public.user_has_role_or_higher(auth.uid(), 'admin'::user_role));
