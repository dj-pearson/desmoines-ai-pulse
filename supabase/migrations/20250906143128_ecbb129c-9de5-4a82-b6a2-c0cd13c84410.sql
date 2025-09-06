-- ===== SECURITY FIX: Restrict Access to Vault Schema =====

-- The security linter detected that vault.decrypted_secrets view has SECURITY DEFINER behavior
-- This is a Supabase system view that we cannot modify directly, but we can restrict access to it

-- First, let's revoke all public access to the vault schema if any exists
-- This prevents regular users from accessing the vault.decrypted_secrets view

-- Revoke all privileges on vault schema from public role
REVOKE ALL PRIVILEGES ON SCHEMA vault FROM public;
REVOKE ALL PRIVILEGES ON SCHEMA vault FROM anon;
REVOKE ALL PRIVILEGES ON SCHEMA vault FROM authenticated;

-- Revoke all privileges on vault.secrets table from public roles
REVOKE ALL PRIVILEGES ON vault.secrets FROM public;
REVOKE ALL PRIVILEGES ON vault.secrets FROM anon; 
REVOKE ALL PRIVILEGES ON vault.secrets FROM authenticated;

-- Create a security audit log entry to document this change
INSERT INTO public.security_audit_logs (
  event_type,
  resource,
  action,
  details,
  severity
) VALUES (
  'security_hardening',
  'vault_schema',
  'restrict_access',
  jsonb_build_object(
    'issue', 'Security Definer View detected in vault.decrypted_secrets',
    'remediation', 'Revoked public access to vault schema',
    'impact', 'Vault functionality restricted to service role only',
    'recommendation', 'Use edge functions for secret management instead of vault if needed'
  ),
  'medium'
);

-- Create a comment to document why we restricted vault access
COMMENT ON SCHEMA vault IS 'Access restricted due to security definer view concerns. Use edge functions for secret management.';

-- Add a function to safely manage secrets if needed in the future
-- This function can be called by edge functions with proper authentication
CREATE OR REPLACE FUNCTION public.log_secret_access_attempt(
  attempted_resource text,
  access_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log any attempts to access vault resources for security monitoring
  INSERT INTO public.security_audit_logs (
    event_type,
    user_id,
    resource,
    action,
    details,
    severity
  ) VALUES (
    'vault_access_attempt',
    auth.uid(),
    attempted_resource,
    access_type,
    jsonb_build_object(
      'user_email', (SELECT email FROM auth.users WHERE id = auth.uid()),
      'timestamp', now(),
      'blocked', true
    ),
    'high'
  );
END;
$$;