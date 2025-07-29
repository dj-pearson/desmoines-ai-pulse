-- Fix security warnings by setting search_path for functions

-- Update get_user_role function with search_path
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY 
     CASE role 
       WHEN 'root_admin' THEN 1
       WHEN 'admin' THEN 2  
       WHEN 'moderator' THEN 3
       WHEN 'user' THEN 4
     END
     LIMIT 1), 
    'user'::public.user_role
  )
$$;

-- Update user_has_role_or_higher function with search_path
CREATE OR REPLACE FUNCTION public.user_has_role_or_higher(user_uuid UUID, required_role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE public.get_user_role(user_uuid)
    WHEN 'root_admin' THEN TRUE
    WHEN 'admin' THEN required_role IN ('admin', 'moderator', 'user')
    WHEN 'moderator' THEN required_role IN ('moderator', 'user')
    WHEN 'user' THEN required_role = 'user'
    ELSE FALSE
  END
$$;

-- Update sync_user_role_to_profile function with search_path
CREATE OR REPLACE FUNCTION public.sync_user_role_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles 
  SET user_role = NEW.role
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Update handle_root_admin_assignment function with search_path
CREATE OR REPLACE FUNCTION public.handle_root_admin_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if this is the root admin email
  IF NEW.email = 'djpearson@pm.me' THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (NEW.id, 'root_admin', NEW.id);
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;