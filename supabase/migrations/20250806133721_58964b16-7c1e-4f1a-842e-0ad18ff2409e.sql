-- Phase 3 Security Enhancement: Enhanced logging and monitoring
-- Create comprehensive security event logging and failed authentication tracking

-- Create table for tracking failed authentication attempts
CREATE TABLE IF NOT EXISTS public.failed_auth_attempts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email text,
    ip_address text,
    user_agent text,
    attempt_type text NOT NULL DEFAULT 'login', -- 'login', 'signup', 'password_reset'
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on failed_auth_attempts
ALTER TABLE public.failed_auth_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view failed auth attempts
CREATE POLICY "Only admins can view failed auth attempts"
ON public.failed_auth_attempts
FOR SELECT
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- System can insert failed auth attempts
CREATE POLICY "System can insert failed auth attempts"
ON public.failed_auth_attempts
FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_failed_auth_attempts_email ON public.failed_auth_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_auth_attempts_ip ON public.failed_auth_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_auth_attempts_created_at ON public.failed_auth_attempts(created_at);

-- Create table for admin action logging
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_user_id uuid NOT NULL,
    action_type text NOT NULL, -- 'user_management', 'content_management', 'system_configuration'
    action_description text NOT NULL,
    target_resource text, -- table or resource affected
    target_id text, -- id of affected resource
    old_values jsonb,
    new_values jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on admin_action_logs
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view admin action logs
CREATE POLICY "Only admins can view admin action logs"
ON public.admin_action_logs
FOR SELECT
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Moderators and above can insert admin action logs
CREATE POLICY "Moderators can insert admin action logs"
ON public.admin_action_logs
FOR INSERT
WITH CHECK (user_has_role_or_higher(auth.uid(), 'moderator'::user_role));

-- Create indexes for admin action logs
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin_user ON public.admin_action_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type ON public.admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at ON public.admin_action_logs(created_at);

-- Create function to check for suspicious authentication patterns
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(p_email text, p_ip_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
    email_attempts integer;
    ip_attempts integer;
    result jsonb;
BEGIN
    -- Count recent attempts by email (last 15 minutes)
    SELECT COUNT(*) INTO email_attempts
    FROM public.failed_auth_attempts
    WHERE email = p_email
      AND created_at > NOW() - INTERVAL '15 minutes';
    
    -- Count recent attempts by IP (last 15 minutes)
    SELECT COUNT(*) INTO ip_attempts
    FROM public.failed_auth_attempts
    WHERE ip_address = p_ip_address
      AND created_at > NOW() - INTERVAL '15 minutes';
    
    -- Build result
    result := jsonb_build_object(
        'email_attempts', email_attempts,
        'ip_attempts', ip_attempts,
        'email_blocked', email_attempts >= 5,
        'ip_blocked', ip_attempts >= 10,
        'blocked', (email_attempts >= 5 OR ip_attempts >= 10)
    );
    
    -- Log suspicious activity
    IF email_attempts >= 3 OR ip_attempts >= 7 THEN
        INSERT INTO public.security_audit_logs (
            event_type,
            resource,
            action,
            details,
            severity,
            ip_address
        ) VALUES (
            'suspicious_auth_activity',
            'authentication',
            'rate_limit_check',
            jsonb_build_object(
                'email', p_email,
                'email_attempts', email_attempts,
                'ip_attempts', ip_attempts
            ),
            CASE 
                WHEN email_attempts >= 5 OR ip_attempts >= 10 THEN 'high'
                ELSE 'medium'
            END,
            p_ip_address
        );
    END IF;
    
    RETURN result;
END;
$function$;

-- Create function for admin action logging
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_admin_user_id uuid,
    p_action_type text,
    p_action_description text,
    p_target_resource text DEFAULT NULL,
    p_target_id text DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
    log_id uuid;
BEGIN
    INSERT INTO public.admin_action_logs (
        admin_user_id,
        action_type,
        action_description,
        target_resource,
        target_id,
        old_values,
        new_values
    ) VALUES (
        p_admin_user_id,
        p_action_type,
        p_action_description,
        p_target_resource,
        p_target_id,
        p_old_values,
        p_new_values
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$function$;

-- Create function to cleanup old logs
CREATE OR REPLACE FUNCTION public.cleanup_old_security_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
    -- Keep failed auth attempts for 30 days
    DELETE FROM public.failed_auth_attempts 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Keep admin action logs for 1 year
    DELETE FROM public.admin_action_logs 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Keep security audit logs for 90 days (already handled in existing function)
    DELETE FROM public.security_audit_logs 
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Keep CSP violation logs for 30 days (already handled in existing function)
    DELETE FROM public.csp_violation_logs 
    WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$function$;