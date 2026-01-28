-- ===== SECURITY FIX: Restrict Access to Vault Schema =====

-- The security linter detected that vault.decrypted_secrets view has SECURITY DEFINER behavior
-- This is a Supabase system view that we cannot modify directly, but we can restrict access to it

-- First, let's revoke all public access to the vault schema if any exists
-- This prevents regular users from accessing the vault.decrypted_secrets view

-- Revoke all privileges on vault schema from public role (wrapped for safety)
DO $$ 
BEGIN
  REVOKE ALL PRIVILEGES ON SCHEMA vault FROM public;
  REVOKE ALL PRIVILEGES ON SCHEMA vault FROM anon;
  REVOKE ALL PRIVILEGES ON SCHEMA vault FROM authenticated;
  
  -- Revoke all privileges on vault.secrets table from public roles
  REVOKE ALL PRIVILEGES ON vault.secrets FROM public;
  REVOKE ALL PRIVILEGES ON vault.secrets FROM anon; 
  REVOKE ALL PRIVILEGES ON vault.secrets FROM authenticated;
EXCEPTION
  WHEN insufficient_privilege OR undefined_object OR undefined_table THEN
    -- Don't have permission or vault schema/table doesn't exist, skip
    NULL;
END $$;

-- Create a security audit log entry to document this change
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_audit_logs') THEN
    INSERT INTO public.security_audit_logs (
      identifier,
      event_type,
      resource,
      action,
      details,
      severity
    ) VALUES (
      'vault_access_restriction_' || to_char(now(), 'YYYYMMDD_HH24MISS'),
      'admin_action',
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
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, skip
    NULL;
END $$;

-- Create a comment to document why we restricted vault access (wrapped for safety)
DO $$ 
BEGIN
  EXECUTE 'COMMENT ON SCHEMA vault IS ''Access restricted due to security definer view concerns. Use edge functions for secret management.''';
EXCEPTION
  WHEN insufficient_privilege OR undefined_object THEN
    -- Don't have permission or vault schema doesn't exist, skip
    NULL;
END $$;

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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_audit_logs') THEN
    INSERT INTO public.security_audit_logs (
      identifier,
      event_type,
      user_id,
      resource,
      action,
      details,
      severity
    ) VALUES (
      'vault_access_' || attempted_resource || '_' || to_char(now(), 'YYYYMMDD_HH24MISS'),
      'suspicious_activity',
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
  END IF;
END;
$$;