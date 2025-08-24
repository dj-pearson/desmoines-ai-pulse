-- Create security audit logs table for comprehensive audit trails
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('rate_limit', 'auth_failure', 'validation_error', 'suspicious_activity', 'admin_action')),
  identifier TEXT NOT NULL, -- User ID or IP address
  endpoint TEXT,
  details JSONB DEFAULT '{}',
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  action TEXT,
  resource TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_timestamp ON public.security_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_severity ON public.security_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_identifier ON public.security_audit_logs(identifier);

-- Enable RLS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Only admins can view security audit logs" 
ON public.security_audit_logs 
FOR SELECT 
USING (public.user_has_role_or_higher(auth.uid(), 'admin'));

CREATE POLICY "System can insert security audit logs" 
ON public.security_audit_logs 
FOR INSERT 
WITH CHECK (true); -- Allow system insertions

-- Create enum for content security policy violations
CREATE TYPE public.csp_violation_type AS ENUM (
  'script_src',
  'style_src',
  'img_src',
  'connect_src',
  'font_src',
  'object_src',
  'media_src',
  'frame_src',
  'base_uri',
  'form_action'
);

-- Create CSP violation logs table
CREATE TABLE IF NOT EXISTS public.csp_violation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_type public.csp_violation_type NOT NULL,
  blocked_uri TEXT NOT NULL,
  document_uri TEXT NOT NULL,
  referrer TEXT,
  violated_directive TEXT NOT NULL,
  effective_directive TEXT,
  original_policy TEXT,
  disposition TEXT DEFAULT 'enforce',
  status_code INTEGER,
  user_agent TEXT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for CSP violations
CREATE INDEX IF NOT EXISTS idx_csp_violation_logs_timestamp ON public.csp_violation_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violation_logs_violation_type ON public.csp_violation_logs(violation_type);

-- Enable RLS for CSP violations
ALTER TABLE public.csp_violation_logs ENABLE ROW LEVEL SECURITY;

-- CSP violation policies
CREATE POLICY "Only admins can view CSP violations" 
ON public.csp_violation_logs 
FOR SELECT 
USING (public.user_has_role_or_higher(auth.uid(), 'admin'));

CREATE POLICY "System can insert CSP violations" 
ON public.csp_violation_logs 
FOR INSERT 
WITH CHECK (true);

-- Create function to clean up old security logs
CREATE OR REPLACE FUNCTION public.cleanup_security_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Keep only last 90 days of security audit logs
  DELETE FROM public.security_audit_logs 
  WHERE timestamp < NOW() - INTERVAL '90 days';
  
  -- Keep only last 30 days of CSP violation logs
  DELETE FROM public.csp_violation_logs 
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$;