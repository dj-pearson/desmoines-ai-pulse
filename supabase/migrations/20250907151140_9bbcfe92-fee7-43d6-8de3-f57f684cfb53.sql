-- Fix infinite recursion in friend_group_members RLS policy
-- Create security definer function to check group membership safely
CREATE OR REPLACE FUNCTION public.user_can_access_group(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is a member of the group
  RETURN EXISTS (
    SELECT 1 FROM public.friend_group_members 
    WHERE user_id = p_user_id AND group_id = p_group_id
  );
END;
$$;

-- Drop existing problematic policy
DROP POLICY IF EXISTS "Users can view group members if they are members" ON public.friend_group_members;

-- Create new safe policy using security definer function
CREATE POLICY "Users can view group members if they are members" 
ON public.friend_group_members 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  public.user_can_access_group(auth.uid(), group_id)
);

-- Drop and recreate user_has_role_or_higher function with proper search path (wrapped for safety)
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.user_has_role_or_higher(uuid, user_role);
  
  CREATE OR REPLACE FUNCTION public.user_has_role_or_higher(p_user_id uuid, p_min_role user_role)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $func$
  DECLARE
    user_role_enum user_role;
    role_hierarchy INTEGER;
    min_role_hierarchy INTEGER;
  BEGIN
    -- Get user's role from user_roles table first, then profiles as fallback
    SELECT role INTO user_role_enum
    FROM public.user_roles 
    WHERE user_id = p_user_id 
    ORDER BY 
      CASE role
        WHEN 'root_admin' THEN 5
        WHEN 'admin' THEN 4  
        WHEN 'moderator' THEN 3
        WHEN 'user' THEN 2
        ELSE 1
      END DESC
    LIMIT 1;
    
    -- Fallback to profiles table if no role found in user_roles
    IF user_role_enum IS NULL THEN
      SELECT user_role INTO user_role_enum
      FROM public.profiles
      WHERE user_id = p_user_id;
    END IF;
    
    -- Default to 'user' if still no role found
    IF user_role_enum IS NULL THEN
      user_role_enum := 'user';
    END IF;
    
    -- Convert roles to hierarchy numbers for comparison
    role_hierarchy := CASE user_role_enum
      WHEN 'root_admin' THEN 5
      WHEN 'admin' THEN 4
      WHEN 'moderator' THEN 3
      WHEN 'user' THEN 2
      ELSE 1
    END;
    
    min_role_hierarchy := CASE p_min_role
      WHEN 'root_admin' THEN 5
      WHEN 'admin' THEN 4
      WHEN 'moderator' THEN 3
      WHEN 'user' THEN 2
      ELSE 1
    END;
    
    RETURN role_hierarchy >= min_role_hierarchy;
  END;
  $func$;
EXCEPTION
  WHEN undefined_object OR undefined_table THEN
    -- user_role type or tables don't exist, skip
    NULL;
END $$;