-- Fix circular dependency in user_roles RLS policies

-- First, drop the existing policies that cause circular dependency
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;

-- Create a simple security definer function to get user role without RLS
CREATE OR REPLACE FUNCTION public.get_user_role_simple(user_uuid uuid)
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = user_uuid ORDER BY created_at DESC LIMIT 1), 
    'user'::public.user_role
  )
$$;

-- Create new RLS policies that avoid circular dependency
CREATE POLICY "Users can view their own role" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Root admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (public.get_user_role_simple(auth.uid()) = 'root_admin');

CREATE POLICY "Admins can view all roles if they are admin" 
ON public.user_roles 
FOR SELECT 
USING (public.get_user_role_simple(auth.uid()) IN ('admin', 'root_admin'));

-- Keep the existing policies for insert, update, delete
-- (These should already exist and work correctly)