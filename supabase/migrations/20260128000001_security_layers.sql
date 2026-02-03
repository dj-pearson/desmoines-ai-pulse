-- =============================================================================
-- Security Layers Migration
-- =============================================================================
-- This migration implements the defense-in-depth security model:
-- Layer 1: Authentication (handled by Supabase Auth)
-- Layer 2: Authorization (permissions and role levels)
-- Layer 3: Resource Ownership (owner/tenant checks)
-- Layer 4: Database RLS (row-level security policies)
-- =============================================================================

-- =============================================================================
-- ROLE LEVELS TABLE
-- =============================================================================
-- Defines role hierarchy for role-level based permission checks

CREATE TABLE IF NOT EXISTS public.role_definitions (
  role TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert role definitions
INSERT INTO public.role_definitions (role, level, description)
VALUES
  ('user', 1, 'Standard authenticated user'),
  ('moderator', 5, 'Content moderator with limited admin access'),
  ('admin', 10, 'Full administrative access'),
  ('root_admin', 100, 'Super administrator with all permissions')
ON CONFLICT (role) DO UPDATE SET
  level = EXCLUDED.level,
  description = EXCLUDED.description;

-- =============================================================================
-- PERMISSIONS TABLE
-- =============================================================================
-- Defines all available permissions in the system

CREATE TABLE IF NOT EXISTS public.permission_definitions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('own', 'team', 'any')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_permission_definitions_resource ON public.permission_definitions(resource);

-- Insert core permissions
INSERT INTO public.permission_definitions (id, resource, action, scope, description)
VALUES
  -- Event permissions
  ('events.view.any', 'events', 'view', 'any', 'View any event'),
  ('events.create.own', 'events', 'create', 'own', 'Create own events'),
  ('events.update.own', 'events', 'update', 'own', 'Update own events'),
  ('events.delete.own', 'events', 'delete', 'own', 'Delete own events'),
  ('events.update.any', 'events', 'update', 'any', 'Update any event (admin)'),
  ('events.delete.any', 'events', 'delete', 'any', 'Delete any event (admin)'),
  ('events.feature.any', 'events', 'feature', 'any', 'Feature any event (admin)'),

  -- Restaurant permissions
  ('restaurants.view.any', 'restaurants', 'view', 'any', 'View any restaurant'),
  ('restaurants.create.own', 'restaurants', 'create', 'own', 'Create restaurants'),
  ('restaurants.update.own', 'restaurants', 'update', 'own', 'Update claimed restaurants'),
  ('restaurants.delete.own', 'restaurants', 'delete', 'own', 'Delete claimed restaurants'),
  ('restaurants.update.any', 'restaurants', 'update', 'any', 'Update any restaurant (admin)'),
  ('restaurants.delete.any', 'restaurants', 'delete', 'any', 'Delete any restaurant (admin)'),
  ('restaurants.claim.own', 'restaurants', 'claim', 'own', 'Claim a restaurant'),

  -- Attraction permissions
  ('attractions.view.any', 'attractions', 'view', 'any', 'View any attraction'),
  ('attractions.create.own', 'attractions', 'create', 'own', 'Create attractions'),
  ('attractions.update.own', 'attractions', 'update', 'own', 'Update own attractions'),
  ('attractions.delete.own', 'attractions', 'delete', 'own', 'Delete own attractions'),
  ('attractions.update.any', 'attractions', 'update', 'any', 'Update any attraction (admin)'),
  ('attractions.delete.any', 'attractions', 'delete', 'any', 'Delete any attraction (admin)'),

  -- User content permissions
  ('favorites.view.own', 'favorites', 'view', 'own', 'View own favorites'),
  ('favorites.create.own', 'favorites', 'create', 'own', 'Create favorites'),
  ('favorites.delete.own', 'favorites', 'delete', 'own', 'Delete own favorites'),

  ('reviews.view.any', 'reviews', 'view', 'any', 'View any review'),
  ('reviews.create.own', 'reviews', 'create', 'own', 'Create reviews'),
  ('reviews.update.own', 'reviews', 'update', 'own', 'Update own reviews'),
  ('reviews.delete.own', 'reviews', 'delete', 'own', 'Delete own reviews'),
  ('reviews.delete.any', 'reviews', 'delete', 'any', 'Delete any review (moderator)'),

  ('discussions.view.any', 'discussions', 'view', 'any', 'View any discussion'),
  ('discussions.create.own', 'discussions', 'create', 'own', 'Create discussions'),
  ('discussions.update.own', 'discussions', 'update', 'own', 'Update own discussions'),
  ('discussions.delete.own', 'discussions', 'delete', 'own', 'Delete own discussions'),
  ('discussions.delete.any', 'discussions', 'delete', 'any', 'Delete any discussion (moderator)'),

  -- Campaign permissions
  ('campaigns.view.own', 'campaigns', 'view', 'own', 'View own campaigns'),
  ('campaigns.view.team', 'campaigns', 'view', 'team', 'View team campaigns'),
  ('campaigns.create.own', 'campaigns', 'create', 'own', 'Create campaigns'),
  ('campaigns.update.own', 'campaigns', 'update', 'own', 'Update own campaigns'),
  ('campaigns.delete.own', 'campaigns', 'delete', 'own', 'Delete own campaigns'),
  ('campaigns.view.any', 'campaigns', 'view', 'any', 'View any campaign (admin)'),
  ('campaigns.update.any', 'campaigns', 'update', 'any', 'Update any campaign (admin)'),

  -- Profile permissions
  ('profile.view.own', 'profile', 'view', 'own', 'View own profile'),
  ('profile.update.own', 'profile', 'update', 'own', 'Update own profile'),
  ('profile.delete.own', 'profile', 'delete', 'own', 'Delete own profile'),

  -- Trip planner permissions
  ('trip_planner.view.own', 'trip_planner', 'view', 'own', 'View own trip plans'),
  ('trip_planner.create.own', 'trip_planner', 'create', 'own', 'Create trip plans'),
  ('trip_planner.update.own', 'trip_planner', 'update', 'own', 'Update own trip plans'),
  ('trip_planner.delete.own', 'trip_planner', 'delete', 'own', 'Delete own trip plans'),

  -- Admin permissions
  ('admin.dashboard.view', 'admin', 'dashboard', 'any', 'View admin dashboard'),
  ('admin.users.view', 'admin', 'users_view', 'any', 'View user list'),
  ('admin.users.update', 'admin', 'users_update', 'any', 'Update user accounts'),
  ('admin.users.delete', 'admin', 'users_delete', 'any', 'Delete user accounts'),
  ('admin.users.manage', 'admin', 'users_manage', 'any', 'Full user management'),
  ('admin.content.moderate', 'admin', 'content_moderate', 'any', 'Moderate content'),
  ('admin.analytics.view', 'admin', 'analytics_view', 'any', 'View analytics'),
  ('admin.settings.view', 'admin', 'settings_view', 'any', 'View settings'),
  ('admin.settings.update', 'admin', 'settings_update', 'any', 'Update settings'),
  ('admin.security.manage', 'admin', 'security_manage', 'any', 'Manage security settings'),
  ('admin.audit_log.view', 'admin', 'audit_log_view', 'any', 'View audit logs')
ON CONFLICT (id) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description;

-- =============================================================================
-- ROLE PERMISSIONS MAPPING
-- =============================================================================
-- Maps permissions to roles

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL REFERENCES public.role_definitions(role) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES public.permission_definitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission_id);

-- Insert role-permission mappings

-- User permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'user', id FROM public.permission_definitions
WHERE id IN (
  'events.view.any',
  'restaurants.view.any',
  'attractions.view.any',
  'favorites.view.own', 'favorites.create.own', 'favorites.delete.own',
  'reviews.view.any', 'reviews.create.own', 'reviews.update.own', 'reviews.delete.own',
  'discussions.view.any', 'discussions.create.own', 'discussions.update.own', 'discussions.delete.own',
  'campaigns.view.own', 'campaigns.create.own', 'campaigns.update.own', 'campaigns.delete.own',
  'profile.view.own', 'profile.update.own', 'profile.delete.own',
  'trip_planner.view.own', 'trip_planner.create.own', 'trip_planner.update.own', 'trip_planner.delete.own',
  'restaurants.claim.own'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Moderator permissions (inherits user + moderation)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'moderator', id FROM public.permission_definitions
WHERE id IN (
  -- All user permissions
  'events.view.any',
  'restaurants.view.any',
  'attractions.view.any',
  'favorites.view.own', 'favorites.create.own', 'favorites.delete.own',
  'reviews.view.any', 'reviews.create.own', 'reviews.update.own', 'reviews.delete.own',
  'discussions.view.any', 'discussions.create.own', 'discussions.update.own', 'discussions.delete.own',
  'campaigns.view.own', 'campaigns.create.own', 'campaigns.update.own', 'campaigns.delete.own',
  'profile.view.own', 'profile.update.own', 'profile.delete.own',
  'trip_planner.view.own', 'trip_planner.create.own', 'trip_planner.update.own', 'trip_planner.delete.own',
  'restaurants.claim.own',
  -- Moderator additions
  'admin.content.moderate',
  'reviews.delete.any',
  'discussions.delete.any',
  'events.create.own', 'events.update.own', 'events.delete.own',
  'campaigns.view.team'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Admin permissions (inherits moderator + admin)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id FROM public.permission_definitions
WHERE id IN (
  -- All moderator permissions
  'events.view.any',
  'restaurants.view.any',
  'attractions.view.any',
  'favorites.view.own', 'favorites.create.own', 'favorites.delete.own',
  'reviews.view.any', 'reviews.create.own', 'reviews.update.own', 'reviews.delete.own',
  'discussions.view.any', 'discussions.create.own', 'discussions.update.own', 'discussions.delete.own',
  'campaigns.view.own', 'campaigns.create.own', 'campaigns.update.own', 'campaigns.delete.own',
  'profile.view.own', 'profile.update.own', 'profile.delete.own',
  'trip_planner.view.own', 'trip_planner.create.own', 'trip_planner.update.own', 'trip_planner.delete.own',
  'restaurants.claim.own',
  'admin.content.moderate',
  'reviews.delete.any',
  'discussions.delete.any',
  'events.create.own', 'events.update.own', 'events.delete.own',
  'campaigns.view.team',
  -- Admin additions
  'events.update.any', 'events.delete.any', 'events.feature.any',
  'restaurants.create.own', 'restaurants.update.any', 'restaurants.delete.any',
  'attractions.create.own', 'attractions.update.any', 'attractions.delete.any',
  'campaigns.view.any', 'campaigns.update.any',
  'admin.dashboard.view',
  'admin.users.view', 'admin.users.update',
  'admin.analytics.view',
  'admin.audit_log.view'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Root admin permissions (all permissions)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'root_admin', id FROM public.permission_definitions
ON CONFLICT (role, permission_id) DO NOTHING;

-- =============================================================================
-- PERMISSION CHECK FUNCTION
-- =============================================================================
-- Helper function to check if a user has a permission

CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_permission_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_role TEXT;
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Get the user's highest role
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY
    CASE role
      WHEN 'root_admin' THEN 4
      WHEN 'admin' THEN 3
      WHEN 'moderator' THEN 2
      ELSE 1
    END DESC
  LIMIT 1;

  -- Default to 'user' if no role found
  IF v_role IS NULL THEN
    v_role := 'user';
  END IF;

  -- Check if the role has the permission
  SELECT EXISTS(
    SELECT 1 FROM public.role_permissions
    WHERE role = v_role AND permission_id = p_permission_id
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$;

-- =============================================================================
-- ROLE LEVEL CHECK FUNCTION
-- =============================================================================
-- Helper function to check if a user meets a minimum role level

CREATE OR REPLACE FUNCTION public.user_meets_role_level(
  p_user_id UUID,
  p_min_level INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_level INTEGER := 1;
BEGIN
  -- Get the user's highest role level
  SELECT COALESCE(MAX(rd.level), 1) INTO v_user_level
  FROM public.user_roles ur
  JOIN public.role_definitions rd ON rd.role = ur.role
  WHERE ur.user_id = p_user_id;

  RETURN v_user_level >= p_min_level;
END;
$$;

-- =============================================================================
-- OWNERSHIP CHECK FUNCTION
-- =============================================================================
-- Helper function to check resource ownership

CREATE OR REPLACE FUNCTION public.user_owns_resource(
  p_user_id UUID,
  p_table_name TEXT,
  p_resource_id UUID,
  p_owner_column TEXT DEFAULT 'user_id'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_is_owner BOOLEAN := FALSE;
BEGIN
  -- Dynamic query to check ownership
  EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1 AND %I = $2)',
    p_table_name,
    p_owner_column
  )
  INTO v_is_owner
  USING p_resource_id, p_user_id;

  RETURN COALESCE(v_is_owner, FALSE);
END;
$$;

-- =============================================================================
-- ENHANCED SECURITY AUDIT LOG
-- =============================================================================
-- Enhanced table for security event logging

-- First check if table exists to add new columns
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'security_audit_logs') THEN
    -- Add permission_checked column if it doesn't exist
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'security_audit_logs' AND column_name = 'permission_checked'
    ) THEN
      ALTER TABLE public.security_audit_logs ADD COLUMN permission_checked TEXT;
    END IF;

    -- Add security_layer column if it doesn't exist
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'security_audit_logs' AND column_name = 'security_layer'
    ) THEN
      ALTER TABLE public.security_audit_logs ADD COLUMN security_layer TEXT;
    END IF;

    -- Add error_code column if it doesn't exist
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'security_audit_logs' AND column_name = 'error_code'
    ) THEN
      ALTER TABLE public.security_audit_logs ADD COLUMN error_code TEXT;
    END IF;
  END IF;
END $$;

-- Create index on new columns if they exist
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_permission ON public.security_audit_logs(permission_checked);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_layer ON public.security_audit_logs(security_layer);

-- =============================================================================
-- LOG SECURITY EVENT FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_permission_checked TEXT DEFAULT NULL,
  p_security_layer TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.security_audit_logs (
    event_type,
    user_id,
    ip_address,
    user_agent,
    resource_type,
    resource_id,
    permission_checked,
    security_layer,
    error_code,
    metadata,
    created_at
  ) VALUES (
    p_event_type,
    p_user_id,
    p_ip_address,
    p_user_agent,
    p_resource_type,
    p_resource_id,
    p_permission_checked,
    p_security_layer,
    p_error_code,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- =============================================================================
-- RLS POLICIES FOR NEW TABLES
-- =============================================================================

-- Role definitions (read-only for all, admin can modify)
ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view role definitions"
  ON public.role_definitions FOR SELECT
  USING (true);

CREATE POLICY "Only root_admin can modify role definitions"
  ON public.role_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'root_admin'
    )
  );

-- Permission definitions (read-only for all, admin can modify)
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view permission definitions"
  ON public.permission_definitions FOR SELECT
  USING (true);

CREATE POLICY "Only root_admin can modify permission definitions"
  ON public.permission_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'root_admin'
    )
  );

-- Role permissions mapping (read-only for all, admin can modify)
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view role permissions"
  ON public.role_permissions FOR SELECT
  USING (true);

CREATE POLICY "Only root_admin can modify role permissions"
  ON public.role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'root_admin'
    )
  );

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT ON public.role_definitions TO authenticated;
GRANT SELECT ON public.permission_definitions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_meets_role_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_resource TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event TO authenticated;

-- Allow anon to read role/permission definitions (for login pages, etc.)
GRANT SELECT ON public.role_definitions TO anon;
GRANT SELECT ON public.permission_definitions TO anon;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.role_definitions IS 'Defines user roles and their hierarchy levels';
COMMENT ON TABLE public.permission_definitions IS 'Defines all available permissions in the system';
COMMENT ON TABLE public.role_permissions IS 'Maps permissions to roles';
COMMENT ON FUNCTION public.user_has_permission IS 'Check if a user has a specific permission';
COMMENT ON FUNCTION public.user_meets_role_level IS 'Check if a user meets a minimum role level';
COMMENT ON FUNCTION public.user_owns_resource IS 'Check if a user owns a specific resource';
COMMENT ON FUNCTION public.log_security_event IS 'Log a security event for audit purposes';
