-- Grant root_admin access to the primary user
-- This migration ensures the account owner has root admin access
-- Run this manually in Supabase SQL Editor if needed

-- First, check if user_roles table has the role for the admin user
-- Replace 'your-email@example.com' with your actual email
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Get the user ID for the admin email
  -- You'll need to replace this with your actual email address
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'your-email@example.com' -- ← CHANGE THIS TO YOUR EMAIL
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    -- Insert or update the user_roles table
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'root_admin')
    ON CONFLICT (user_id, role) 
    DO UPDATE SET updated_at = now();

    -- Also update the profiles table for consistency
    UPDATE public.profiles
    SET user_role = 'root_admin'
    WHERE user_id = admin_user_id;

    RAISE NOTICE 'Root admin access granted to user: %', admin_user_id;
  ELSE
    RAISE NOTICE 'User not found with that email address';
  END IF;
END $$;
