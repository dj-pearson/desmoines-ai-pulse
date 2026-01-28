-- Fix is_admin() function to check both user_roles and profiles tables
-- This matches the frontend AuthContext logic

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- First check user_roles table
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Fall back to profiles table (user_role column)
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND user_role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Also check profiles.role for backwards compatibility
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'root_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a comment explaining the function
COMMENT ON FUNCTION is_admin() IS
  'Checks if the current user is an admin by looking at user_roles and profiles tables';
