-- ============================================================================
-- Security Enhancements Migration
-- Date: 2025-11-09
-- Purpose: Implement critical security fixes from security audit
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Security Settings Table (replace localStorage)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

-- Only root admins can manage security settings
CREATE POLICY "Only root admins can manage security settings"
ON public.security_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'root_admin'
  )
);

-- Insert default security settings
INSERT INTO public.security_settings (setting_key, setting_value, description) VALUES
('rate_limit', '100', 'Requests per minute allowed'),
('maintenance_mode', 'false', 'Enable maintenance mode'),
('user_registration_enabled', 'true', 'Allow new user registrations'),
('content_moderation', 'true', 'Auto-moderate user submissions'),
('auto_block', 'false', 'Automatically block suspicious IPs'),
('max_login_attempts', '5', 'Maximum failed login attempts before lockout'),
('lockout_duration_minutes', '15', 'Duration of account lockout in minutes'),
('session_timeout_minutes', '60', 'Session idle timeout in minutes'),
('max_session_duration_hours', '8', 'Maximum session duration in hours'),
('suspicious_activity_threshold', '10', 'Threshold for flagging suspicious activity'),
('require_mfa_for_admin', 'false', 'Require MFA for admin accounts')
ON CONFLICT (setting_key) DO NOTHING;

-- Add update trigger
CREATE OR REPLACE FUNCTION update_security_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_security_settings_timestamp
BEFORE UPDATE ON public.security_settings
FOR EACH ROW
EXECUTE FUNCTION update_security_settings_timestamp();

-- ----------------------------------------------------------------------------
-- 2. Failed Login Attempts Tracking (Account Lockout)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  attempt_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  success BOOLEAN DEFAULT false,
  lockout_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Admins can view all failed attempts
CREATE POLICY "Admins can view failed login attempts"
ON public.failed_login_attempts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  )
);

-- System can insert failed attempts (service role)
CREATE POLICY "Service role can insert failed attempts"
ON public.failed_login_attempts
FOR INSERT
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_failed_logins_email ON public.failed_login_attempts(email);
CREATE INDEX idx_failed_logins_ip ON public.failed_login_attempts(ip_address);
CREATE INDEX idx_failed_logins_time ON public.failed_login_attempts(attempt_time);

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_lockout_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER;
  v_lockout_duration INTEGER;
  v_failed_count INTEGER;
BEGIN
  -- Get security settings
  SELECT (setting_value::TEXT)::INTEGER INTO v_max_attempts
  FROM public.security_settings
  WHERE setting_key = 'max_login_attempts';

  SELECT (setting_value::TEXT)::INTEGER INTO v_lockout_duration
  FROM public.security_settings
  WHERE setting_key = 'lockout_duration_minutes';

  -- Default to 5 attempts and 15 minutes if not set
  v_max_attempts := COALESCE(v_max_attempts, 5);
  v_lockout_duration := COALESCE(v_lockout_duration, 15);

  -- Check for active lockout
  SELECT lockout_until INTO v_lockout_until
  FROM public.failed_login_attempts
  WHERE email = p_email
  AND lockout_until IS NOT NULL
  AND lockout_until > now()
  ORDER BY attempt_time DESC
  LIMIT 1;

  IF v_lockout_until IS NOT NULL THEN
    RETURN true;
  END IF;

  -- Count recent failed attempts (last 15 minutes)
  SELECT COUNT(*) INTO v_failed_count
  FROM public.failed_login_attempts
  WHERE email = p_email
  AND success = false
  AND attempt_time > now() - INTERVAL '15 minutes';

  IF v_failed_count >= v_max_attempts THEN
    -- Create lockout
    UPDATE public.failed_login_attempts
    SET lockout_until = now() + (v_lockout_duration || ' minutes')::INTERVAL
    WHERE email = p_email
    AND attempt_time > now() - INTERVAL '15 minutes';

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_success BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.failed_login_attempts (
    email,
    ip_address,
    user_agent,
    success,
    attempt_time
  ) VALUES (
    p_email,
    p_ip_address,
    p_user_agent,
    p_success,
    now()
  );

  -- Clear old successful attempts
  DELETE FROM public.failed_login_attempts
  WHERE email = p_email
  AND success = true
  AND attempt_time < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. IP Blocklist Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT UNIQUE NOT NULL,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  blocked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- Admins can manage blocked IPs
CREATE POLICY "Admins can manage blocked IPs"
ON public.blocked_ips
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  )
);

-- Add index
CREATE INDEX idx_blocked_ips_address ON public.blocked_ips(ip_address);
CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips(expires_at);

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_blocked BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = p_ip_address
    AND (
      is_permanent = true
      OR expires_at IS NULL
      OR expires_at > now()
    )
  ) INTO v_blocked;

  RETURN COALESCE(v_blocked, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. IP Whitelist Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whitelisted_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT UNIQUE NOT NULL,
  description TEXT,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whitelisted_ips ENABLE ROW LEVEL SECURITY;

-- Only root admins can manage whitelist
CREATE POLICY "Root admins can manage IP whitelist"
ON public.whitelisted_ips
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'root_admin'
  )
);

-- Add index
CREATE INDEX idx_whitelisted_ips_address ON public.whitelisted_ips(ip_address);

-- ----------------------------------------------------------------------------
-- 5. Security Audit Logs Enhancement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  endpoint TEXT,
  method TEXT,
  payload JSONB,
  response_status INTEGER,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view audit logs
CREATE POLICY "Admins can view security audit logs"
ON public.security_audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'root_admin')
  )
);

-- System can insert audit logs
CREATE POLICY "Service role can insert audit logs"
ON public.security_audit_logs
FOR INSERT
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_security_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX idx_security_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX idx_security_logs_ip ON public.security_audit_logs(ip_address);
CREATE INDEX idx_security_logs_severity ON public.security_audit_logs(severity);
CREATE INDEX idx_security_logs_created ON public.security_audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. Cleanup Functions
-- ----------------------------------------------------------------------------

-- Clean up old security logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_security_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.security_audit_logs
  WHERE created_at < now() - INTERVAL '90 days';

  DELETE FROM public.failed_login_attempts
  WHERE attempt_time < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup job (if pg_cron is available)
-- SELECT cron.schedule(
--   'cleanup-security-logs',
--   '0 2 * * *', -- Run daily at 2 AM
--   $$SELECT cleanup_old_security_logs()$$
-- );

-- ----------------------------------------------------------------------------
-- Grant Permissions
-- ----------------------------------------------------------------------------

-- Grant execute permissions on security functions
GRANT EXECUTE ON FUNCTION is_account_locked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_ip_blocked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_security_logs() TO service_role;

-- ============================================================================
-- End of Migration
-- ============================================================================
