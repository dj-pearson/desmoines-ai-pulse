-- Create user roles enum
CREATE TYPE public.user_role AS ENUM ('user', 'moderator', 'admin', 'root_admin');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'user',
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Create function to check if user has specific role or higher
CREATE OR REPLACE FUNCTION public.user_has_role_or_higher(user_uuid UUID, required_role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE public.get_user_role(user_uuid)
    WHEN 'root_admin' THEN TRUE
    WHEN 'admin' THEN required_role IN ('admin', 'moderator', 'user')
    WHEN 'moderator' THEN required_role IN ('moderator', 'user')
    WHEN 'user' THEN required_role = 'user'
    ELSE FALSE
  END
$$;

-- Create policies for user_roles table
CREATE POLICY "Users can view their own role" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (public.user_has_role_or_higher(auth.uid(), 'admin'));

CREATE POLICY "Admins can assign roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (public.user_has_role_or_higher(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles" 
ON public.user_roles 
FOR UPDATE 
USING (public.user_has_role_or_higher(auth.uid(), 'admin'));

CREATE POLICY "Root admins can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (public.user_has_role_or_higher(auth.uid(), 'root_admin'));

-- Update profiles table to include role information for easier querying
ALTER TABLE public.profiles ADD COLUMN user_role public.user_role DEFAULT 'user';

-- Create function to sync role to profiles table
CREATE OR REPLACE FUNCTION public.sync_user_role_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles 
  SET user_role = NEW.role
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Create trigger to sync roles
CREATE TRIGGER sync_role_to_profile
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_role_to_profile();

-- Create function to assign root admin on signup
CREATE OR REPLACE FUNCTION public.handle_root_admin_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger for automatic role assignment
CREATE TRIGGER assign_user_role_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_root_admin_assignment();

-- Add trigger for updating timestamps
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_profiles_user_role ON public.profiles(user_role);

-- Insert root admin role for existing user if email matches
DO $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  SELECT id, 'root_admin', id
  FROM auth.users 
  WHERE email = 'djpearson@pm.me'
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;