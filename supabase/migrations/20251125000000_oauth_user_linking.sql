-- ============================================================================
-- OAuth User Linking Migration
-- ============================================================================
-- Purpose: Handle OAuth logins to properly link users to existing accounts/roles
-- This fixes the issue where Google OAuth creates a new user instead of linking
-- to an existing account with the same email
-- ============================================================================

-- Function to link OAuth user to existing account role by email
-- This is called after a user signs in via OAuth to ensure they get their correct role
CREATE OR REPLACE FUNCTION public.link_oauth_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_user_id UUID;
  existing_role public.user_role;
BEGIN
  -- Only process if this is an OAuth-linked identity (not email/password)
  -- The identities column will have provider info for OAuth users
  
  -- Check if there's another user with the same email that has a role
  -- This handles the case where user signed up with email/password first
  -- and later tries to sign in with OAuth
  SELECT ur.user_id, ur.role INTO existing_user_id, existing_role
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  WHERE LOWER(au.email) = LOWER(NEW.email)
    AND ur.user_id != NEW.id
  ORDER BY 
    CASE ur.role
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  -- If we found an existing user with a role, copy that role to the new OAuth user
  IF existing_role IS NOT NULL THEN
    -- Insert the role for the new OAuth user
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (NEW.id, existing_role, existing_user_id)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'OAuth user % linked to existing role: %', NEW.id, existing_role;
  END IF;

  -- Also check profiles table and copy user_role if it exists
  UPDATE public.profiles
  SET user_role = existing_role
  WHERE user_id = NEW.id
    AND existing_role IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users to run after insert (new user) or update
DROP TRIGGER IF EXISTS link_oauth_user_role_trigger ON auth.users;
CREATE TRIGGER link_oauth_user_role_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_oauth_user_role();

-- ============================================================================
-- Alternative: Function to get user role by email (for application-level lookup)
-- ============================================================================
-- This can be called from the frontend to check role by email instead of user_id

CREATE OR REPLACE FUNCTION public.get_role_by_email(p_email TEXT)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_role public.user_role;
BEGIN
  -- Find the highest role for any user with this email
  SELECT ur.role INTO found_role
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  WHERE LOWER(au.email) = LOWER(p_email)
  ORDER BY 
    CASE ur.role
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  RETURN COALESCE(found_role, 'user'::public.user_role);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_role_by_email(TEXT) TO authenticated;

-- ============================================================================
-- Function to sync OAuth user with existing account
-- ============================================================================
-- Call this after OAuth sign-in to ensure the user has the correct role

CREATE OR REPLACE FUNCTION public.sync_oauth_user_role(p_user_id UUID)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
  existing_role public.user_role;
  current_user_role public.user_role;
BEGIN
  -- Get the current user's email
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF user_email IS NULL THEN
    RETURN 'user'::public.user_role;
  END IF;

  -- Check if this user already has a role
  SELECT role INTO current_user_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY 
    CASE role
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
  SELECT ur.role INTO existing_role
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  WHERE LOWER(au.email) = LOWER(user_email)
    AND ur.user_id != p_user_id
  ORDER BY 
    CASE ur.role
      WHEN 'root_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'moderator' THEN 3
      ELSE 4
    END
  LIMIT 1;

  -- If found, assign the role to this OAuth user
  IF existing_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, existing_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Also update profiles if exists
    UPDATE public.profiles
    SET user_role = existing_role
    WHERE user_id = p_user_id;
    
    RETURN existing_role;
  END IF;

  RETURN 'user'::public.user_role;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.sync_oauth_user_role(UUID) TO authenticated;

-- ============================================================================
-- One-time fix: Link existing OAuth users to their email-matched roles
-- ============================================================================
DO $$
DECLARE
  oauth_user RECORD;
  existing_role public.user_role;
BEGIN
  -- Find OAuth users without roles whose email matches a user with a role
  FOR oauth_user IN 
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.user_roles ur ON ur.user_id = au.id
    WHERE ur.user_id IS NULL  -- No role assigned
    AND au.email IS NOT NULL
  LOOP
    -- Check if another user with same email has a role
    SELECT ur2.role INTO existing_role
    FROM public.user_roles ur2
    INNER JOIN auth.users au2 ON au2.id = ur2.user_id
    WHERE LOWER(au2.email) = LOWER(oauth_user.email)
    ORDER BY 
      CASE ur2.role
        WHEN 'root_admin' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'moderator' THEN 3
        ELSE 4
      END
    LIMIT 1;

    -- Assign the role if found
    IF existing_role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (oauth_user.id, existing_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      RAISE NOTICE 'Linked OAuth user % (%) to role: %', oauth_user.id, oauth_user.email, existing_role;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.link_oauth_user_role() IS 'Trigger function to automatically link OAuth users to existing account roles by email';
COMMENT ON FUNCTION public.get_role_by_email(TEXT) IS 'Get user role by email address (useful for OAuth lookups)';
COMMENT ON FUNCTION public.sync_oauth_user_role(UUID) IS 'Sync OAuth user role with any existing account that shares the same email';

