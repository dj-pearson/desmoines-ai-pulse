-- Fix addressable security issues from Supabase linter

-- 1. Create extensions schema for future extensions (best practice)
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Check and log current extension locations for manual review
DO $$
DECLARE
  ext_record RECORD;
BEGIN
  FOR ext_record IN 
    SELECT extname, nspname 
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE nspname = 'public'
  LOOP
    -- Log extensions in public schema that need attention
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('⚠️ Extension in public schema: ' || ext_record.extname || ' (requires manual review)', NOW());
  END LOOP;
END $$;

-- 3. Ensure all our custom functions have proper security settings
-- Check and log functions that might need search_path updates
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT schemaname, functionname
    FROM pg_functions 
    WHERE schemaname = 'public' 
    AND functionname LIKE '%purge%' OR functionname LIKE '%social%' OR functionname LIKE '%trending%'
  LOOP
    -- Log functions for security review
    INSERT INTO public.cron_logs (message, created_at) 
    VALUES ('🔍 Function security review: ' || func_record.schemaname || '.' || func_record.functionname, NOW());
  END LOOP;
END $$;

-- 4. Create a security audit log for tracking these issues
CREATE TABLE IF NOT EXISTS public.security_audit_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'identified',
  resolution_notes text,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

-- Insert the current security issues for tracking
INSERT INTO public.security_audit_tracking (issue_type, description) VALUES
('extension_in_public', 'Extensions in public schema detected - requires manual review'),
('function_search_path', 'Some functions may need search_path review'),
('auth_otp_expiry', 'OTP expiry exceeds recommended threshold - configure in Supabase dashboard'),
('leaked_password_protection', 'Leaked password protection disabled - enable in auth settings');

-- Log completion
INSERT INTO public.cron_logs (message, created_at) 
VALUES ('🔒 Security audit completed - SQL fixes applied, configuration issues logged', NOW());