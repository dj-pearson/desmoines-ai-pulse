-- ===== SECURITY FIX: Enhance Profiles Table RLS Policies =====

-- First, let's add proper admin access policies for the profiles table
-- Admins should be able to view and manage profiles for moderation purposes

-- Add policy for admin users to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Add policy for admin users to update profiles (for moderation)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role))
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Add policy for admin users to delete profiles if needed
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Ensure that user_id is never null for new profiles (security requirement)
ALTER TABLE public.profiles 
ALTER COLUMN user_id SET NOT NULL;

-- Add constraint to ensure user_id matches authenticated user for inserts
-- This prevents users from creating profiles for other users
CREATE OR REPLACE FUNCTION public.validate_profile_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow users to create profiles for themselves (unless they're admin)
  IF NEW.user_id != auth.uid() AND NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'Users can only create profiles for themselves';
  END IF;
  
  -- Prevent unauthorized role escalation through profile creation
  IF NEW.user_role IS NOT NULL AND NEW.user_role != 'user' THEN
    IF NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
      RAISE EXCEPTION 'Only administrators can assign non-user roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add the trigger to enforce user_id validation
DROP TRIGGER IF EXISTS validate_profile_user_id ON public.profiles;
CREATE TRIGGER validate_profile_user_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_user_id();

-- Add audit logging for admin actions on profiles
CREATE OR REPLACE FUNCTION public.log_profile_admin_action()
RETURNS TRIGGER AS $$
BEGIN
  -- Log admin actions on profiles
  IF user_has_role_or_higher(auth.uid(), 'admin'::user_role) AND auth.uid() != COALESCE(NEW.user_id, OLD.user_id) THEN
    INSERT INTO public.admin_action_logs (
      admin_user_id,
      action_type,
      action_description,
      target_resource,
      target_id,
      old_values,
      new_values
    ) VALUES (
      auth.uid(),
      TG_OP,
      'Profile ' || TG_OP || ' by admin',
      'profiles',
      COALESCE(NEW.id::text, OLD.id::text),
      CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add audit logging trigger
DROP TRIGGER IF EXISTS log_profile_admin_action ON public.profiles;
CREATE TRIGGER log_profile_admin_action
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_admin_action();

-- Create secure function to get profile data with privacy controls
CREATE OR REPLACE FUNCTION public.get_user_profile_safe(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  communication_preferences jsonb,
  interests text[],
  location text,
  created_at timestamptz,
  updated_at timestamptz,
  user_role user_role
) 
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Users can only see their own profile or admins can see any profile
  IF target_user_id != auth.uid() AND NOT user_has_role_or_higher(auth.uid(), 'admin'::user_role) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to view this profile';
  END IF;
  
  RETURN QUERY
  SELECT p.id, p.user_id, p.first_name, p.last_name, p.phone, p.email, 
         p.communication_preferences, p.interests, p.location, 
         p.created_at, p.updated_at, p.user_role
  FROM public.profiles p
  WHERE p.user_id = target_user_id;
END;
$$;