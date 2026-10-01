-- Non-core review WP5 (admin): role precedence in validate_role_assignment,
-- and a trigger-level check that an admin cannot change an admin's role.
--
-- 1. public.role_rank(text). New, IMMUTABLE. root_admin 0, admin 1,
--    moderator 2, anything else 3. Same order as src/lib/roles.ts and
--    supabase/functions/_shared/roles.ts.
--
-- 2. validate_role_assignment, CREATE OR REPLACE. Three changes from
--    20251125000001:
--    a. The assigner's role is their STRONGEST row, not their newest. An admin
--       who was later given a 'moderator' row read as moderator here and was
--       refused. This only widens what a real admin may do.
--    b. On UPDATE, an assigner below root_admin may not change a row whose OLD
--       role ranks at or above their own. The assign-role edge function
--       already refuses this (decideRoleChange); this is the same rule where
--       the service role cannot skip it. The only writers of user_roles are
--       assign-role and system paths with assigned_by NULL, which still pass
--       unchecked, so no shipped client is affected (user_roles client writes
--       have been denied by RLS since 20260612000000).
--    c. The audit insert now sets identifier, which is NOT NULL. It never did,
--       so every audit row this trigger tried to write failed inside its own
--       EXCEPTION block and nothing was recorded.
--
-- 3. security_audit_logs_event_type_check gains 'role_assignment'. Both this
--    trigger and assign-role write that event type, and the CHECK from
--    20260709000014 does not list it, so neither row was ever stored. Adding
--    an allowed value is additive. NOT VALID so existing rows are not
--    re-scanned; new rows are checked as before. Any later migration that
--    redefines this CHECK must keep every value below.

CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'root_admin' THEN 0
    WHEN 'admin' THEN 1
    WHEN 'moderator' THEN 2
    ELSE 3
  END;
$$;

COMMENT ON FUNCTION public.role_rank(text) IS
  'Role precedence, lower is stronger. Mirrors ROLE_PRECEDENCE in src/lib/roles.ts and supabase/functions/_shared/roles.ts.';

CREATE OR REPLACE FUNCTION public.validate_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  assigner_role TEXT;
  target_role TEXT;
BEGIN
  -- System-initiated assignments (OAuth linking, migrations) carry no
  -- assigned_by and are not validated.
  IF NEW.assigned_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- The assigner's strongest grant, not their newest.
  SELECT role::TEXT INTO assigner_role
  FROM public.user_roles
  WHERE user_id = NEW.assigned_by
  ORDER BY public.role_rank(role::TEXT), created_at DESC
  LIMIT 1;

  IF assigner_role IS NULL THEN
    SELECT user_role::TEXT INTO assigner_role
    FROM public.profiles
    WHERE user_id = NEW.assigned_by;
  END IF;

  IF assigner_role IS NULL THEN
    assigner_role := 'user';
  END IF;

  target_role := NEW.role::TEXT;

  IF target_role = 'root_admin' AND assigner_role != 'root_admin' THEN
    RAISE EXCEPTION 'Only root administrators can assign root_admin role';
  END IF;

  IF target_role = 'admin' AND assigner_role NOT IN ('root_admin', 'admin') THEN
    RAISE EXCEPTION 'Only root administrators and administrators can assign admin role';
  END IF;

  IF target_role = 'moderator' AND assigner_role NOT IN ('root_admin', 'admin') THEN
    RAISE EXCEPTION 'Only administrators and above can assign moderator role';
  END IF;

  IF target_role = 'user' AND assigner_role NOT IN ('root_admin', 'admin', 'moderator') THEN
    RAISE EXCEPTION 'Only moderators and above can assign user role';
  END IF;

  -- An admin cannot change the role of an admin or root_admin.
  IF TG_OP = 'UPDATE'
     AND assigner_role <> 'root_admin'
     AND public.role_rank(OLD.role::TEXT) <= public.role_rank(assigner_role) THEN
    RAISE EXCEPTION 'Only root administrators can change the role of a %', OLD.role::TEXT;
  END IF;

  BEGIN
    INSERT INTO public.security_audit_logs (
      event_type,
      identifier,
      user_id,
      resource,
      action,
      details,
      severity
    ) VALUES (
      'role_assignment',
      NEW.assigned_by::TEXT,
      NEW.assigned_by,
      'user_roles',
      'assign_role',
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'assigned_role', NEW.role,
        'previous_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role::TEXT END,
        'assigner_role', assigner_role
      ),
      CASE
        WHEN target_role IN ('root_admin', 'admin') THEN 'high'
        WHEN target_role = 'moderator' THEN 'medium'
        ELSE 'low'
      END
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block a role change on an audit write.
    NULL;
  END;

  RETURN NEW;
END;
$function$;

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT IF EXISTS security_audit_logs_event_type_check;

ALTER TABLE public.security_audit_logs
  ADD CONSTRAINT security_audit_logs_event_type_check
  CHECK (event_type IN (
    'rate_limit', 'auth_failure', 'validation_error', 'suspicious_activity', 'admin_action',
    'agent_task_routing', 'agent_control', 'agent_action_approval', 'security_anomaly',
    'role_assignment'
  )) NOT VALID;
