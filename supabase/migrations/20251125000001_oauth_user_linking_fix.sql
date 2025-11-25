-- ============================================================================
-- OAuth User Linking Fix - Schema-Safe Version
-- ============================================================================
-- This migration fixes OAuth login issues by avoiding enum type references
-- that cause schema context issues when triggers run on auth.users
-- ============================================================================

-- First, drop the problematic trigger if it exists
DROP TRIGGER IF EXISTS link_oauth_user_role_trigger ON auth.users;

-- Drop the previous functions that had enum type issues
DROP FUNCTION IF EXISTS public.link_oauth_user_role();
DROP FUNCTION IF EXISTS public.get_role_by_email(TEXT);
DROP FUNCTION IF EXISTS public.sync_oauth_user_role(UUID);

-- Update validate_role_assignment to allow NULL assigned_by (system assignments)
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
  -- IMPORTANT: Allow system-initiated role assignments (OAuth linking, migrations, etc.)
  -- These are identified by assigned_by being NULL
  IF NEW.assigned_by IS NULL THEN
    -- This is a system/automatic assignment (e.g., OAuth user linking)
    -- Allow it without validation
    RETURN NEW;
  END IF;
  
  -- Get the assigner's role (as TEXT to avoid schema issues)
  SELECT role::TEXT INTO assigner_role
  FROM public.user_roles
  WHERE user_id = NEW.assigned_by
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no role found in user_roles, check profiles table
  IF assigner_role IS NULL THEN
    SELECT user_role::TEXT INTO assigner_role
    FROM public.profiles
    WHERE user_id = NEW.assigned_by;
  END IF;
  
  -- Default to 'user' if still no role found
  IF assigner_role IS NULL THEN
    assigner_role := 'user';
  END IF;
  
  target_role := NEW.role::TEXT;
  
  -- Role assignment validation rules
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
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- Ignore audit log errors to not block the role assignment
    NULL;
  END;
  
  RETURN NEW;
END;
$function$;

-- Function to sync OAuth user role - returns TEXT to avoid enum issues
CREATE OR REPLACE FUNCTION public.sync_oauth_user_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
  existing_role TEXT;
  current_user_role TEXT;
BEGIN
  -- Get the current user's email
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF user_email IS NULL THEN
    RETURN 'user';
  END IF;

  -- Check if this user already has a role
  SELECT role::TEXT INTO current_user_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY 
    CASE role::TEXT
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF current_user_role IS NOT NULL THEN
    RETURN current_user_role;
  END IF;

  -- Find role for any other user with the same email
  SELECT ur.role::TEXT INTO existing_role
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  WHERE LOWER(au.email) = LOWER(user_email)
    AND ur.user_id != p_user_id
  ORDER BY 
    CASE ur.role::TEXT
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  -- If found, assign the role to this OAuth user
  IF existing_role IS NOT NULL THEN
    -- Insert with the role value - assigned_by is NULL for system assignments
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, existing_role::public.user_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Also update profiles if exists
    UPDATE public.profiles
    SET user_role = existing_role::public.user_role
    WHERE user_id = p_user_id;
    
    RETURN existing_role;
  END IF;

  RETURN 'user';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.sync_oauth_user_role(UUID) TO authenticated;

-- One-time fix: Link existing OAuth users to their email-matched roles
DO $$
DECLARE
  oauth_user RECORD;
  existing_role TEXT;
BEGIN
  -- Find users without roles whose email matches a user with a role
  FOR oauth_user IN 
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.user_roles ur ON ur.user_id = au.id
    WHERE ur.user_id IS NULL  -- No role assigned
    AND au.email IS NOT NULL
  LOOP
    -- Check if another user with same email has a role
    SELECT ur2.role::TEXT INTO existing_role
    FROM public.user_roles ur2
    INNER JOIN auth.users au2 ON au2.id = ur2.user_id
    WHERE LOWER(au2.email) = LOWER(oauth_user.email)
      AND au2.id != oauth_user.id
    ORDER BY 
      CASE ur2.role::TEXT
        WHEN 'root_admin' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'moderator' THEN 3
        ELSE 4
      END
    LIMIT 1;

    -- Assign the role if found
    IF existing_role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (oauth_user.id, existing_role::public.user_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      RAISE NOTICE 'Linked user % (%) to role: %', oauth_user.id, oauth_user.email, existing_role;
    END IF;
  END LOOP;
END;
$$;

-- Note: We're NOT creating a trigger on auth.users because that causes schema context issues
-- Instead, the sync_oauth_user_role function should be called from the application layer
-- after OAuth login (which is already done in useAuth.ts and useAdminAuth.ts)

COMMENT ON FUNCTION public.sync_oauth_user_role(UUID) IS 'Sync OAuth user role with any existing account that shares the same email. Returns role as TEXT to avoid enum schema issues.';

