-- Phase 2 Security Enhancement: Add role assignment validation
-- Create security validation for role assignments to prevent privilege escalation

-- Create function to validate role assignment permissions
CREATE OR REPLACE FUNCTION public.validate_role_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  assigner_role TEXT;
  target_role TEXT;
BEGIN
  -- Get the assigner's role
  SELECT role INTO assigner_role
  FROM public.user_roles
  WHERE user_id = NEW.assigned_by
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no role found in user_roles, check profiles table
  IF assigner_role IS NULL THEN
    SELECT user_role INTO assigner_role
    FROM public.profiles
    WHERE user_id = NEW.assigned_by;
  END IF;
  
  -- Default to 'user' if still no role found
  IF assigner_role IS NULL THEN
    assigner_role := 'user';
  END IF;
  
  target_role := NEW.role;
  
  -- Role assignment validation rules:
  -- 1. Only root_admin can assign root_admin role
  -- 2. Only root_admin and admin can assign admin role
  -- 3. Only admin+ can assign moderator role
  -- 4. Anyone admin+ can assign user role
  
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
  
  -- Log the role assignment for security audit
  INSERT INTO public.security_audit_logs (
    event_type,
    user_id,
    resource,
    action,
    details,
    severity
  ) VALUES (
    'role_assignment',
    NEW.assigned_by,
    'user_roles',
    'assign_role',
    jsonb_build_object(
      'target_user_id', NEW.user_id,
      'assigned_role', NEW.role,
      'assigner_role', assigner_role
    ),
    CASE 
      WHEN target_role IN ('root_admin', 'admin') THEN 'high'
      WHEN target_role = 'moderator' THEN 'medium'
      ELSE 'low'
    END
  );
  
  RETURN NEW;
END;
$function$;

-- Create trigger for role assignment validation
DROP TRIGGER IF EXISTS validate_role_assignment_trigger ON public.user_roles;
CREATE TRIGGER validate_role_assignment_trigger
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_assignment();

-- Create function to prevent self-role-modification
CREATE OR REPLACE FUNCTION public.prevent_self_role_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Prevent users from modifying their own roles (except for the initial root admin setup)
  IF NEW.user_id = NEW.assigned_by AND OLD IS NOT NULL THEN
    RAISE EXCEPTION 'Users cannot modify their own roles';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger to prevent self-role modification
DROP TRIGGER IF EXISTS prevent_self_role_modification_trigger ON public.user_roles;
CREATE TRIGGER prevent_self_role_modification_trigger
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_modification();