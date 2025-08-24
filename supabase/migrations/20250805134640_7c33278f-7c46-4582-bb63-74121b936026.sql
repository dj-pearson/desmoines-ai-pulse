-- Add function to safely log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_identifier TEXT,
  p_endpoint TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'medium',
  p_user_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_resource TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.security_audit_logs (
    event_type,
    identifier,
    endpoint,
    details,
    severity,
    user_id,
    action,
    resource,
    ip_address,
    user_agent
  ) VALUES (
    p_event_type,
    p_identifier,
    p_endpoint,
    p_details,
    p_severity,
    p_user_id,
    p_action,
    p_resource,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Add function to get security events with filters
CREATE OR REPLACE FUNCTION public.get_security_events(
  p_event_type TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  identifier TEXT,
  endpoint TEXT,
  details JSONB,
  severity TEXT,
  timestamp TIMESTAMPTZ,
  user_id UUID,
  action TEXT,
  resource TEXT,
  ip_address TEXT,
  user_agent TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has admin role
  IF NOT public.user_has_role_or_higher(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized access to security events';
  END IF;

  RETURN QUERY
  SELECT 
    sal.id,
    sal.event_type,
    sal.identifier,
    sal.endpoint,
    sal.details,
    sal.severity,
    sal.timestamp,
    sal.user_id,
    sal.action,
    sal.resource,
    sal.ip_address,
    sal.user_agent
  FROM public.security_audit_logs sal
  WHERE 
    (p_event_type IS NULL OR sal.event_type = p_event_type) AND
    (p_severity IS NULL OR sal.severity = p_severity) AND
    (p_start_date IS NULL OR sal.timestamp >= p_start_date::TIMESTAMPTZ) AND
    (p_end_date IS NULL OR sal.timestamp <= p_end_date::TIMESTAMPTZ) AND
    (p_user_id IS NULL OR sal.user_id = p_user_id)
  ORDER BY sal.timestamp DESC
  LIMIT p_limit;
END;
$$;

-- Add function to get security statistics
CREATE OR REPLACE FUNCTION public.get_security_stats(
  p_time_range TEXT DEFAULT '24h'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_stats JSONB;
  v_by_type JSONB;
  v_by_severity JSONB;
  v_total INTEGER;
  v_rate_limit INTEGER;
  v_auth_failures INTEGER;
  v_validation_errors INTEGER;
  v_suspicious_activity INTEGER;
BEGIN
  -- Check if user has admin role
  IF NOT public.user_has_role_or_higher(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized access to security statistics';
  END IF;

  -- Calculate start time based on range
  v_start_time := CASE 
    WHEN p_time_range = '24h' THEN NOW() - INTERVAL '24 hours'
    WHEN p_time_range = '7d' THEN NOW() - INTERVAL '7 days'
    WHEN p_time_range = '30d' THEN NOW() - INTERVAL '30 days'
    ELSE NOW() - INTERVAL '24 hours'
  END;

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.security_audit_logs
  WHERE timestamp >= v_start_time;

  -- Get counts by type
  SELECT COUNT(*) INTO v_rate_limit
  FROM public.security_audit_logs
  WHERE timestamp >= v_start_time AND event_type = 'rate_limit';

  SELECT COUNT(*) INTO v_auth_failures
  FROM public.security_audit_logs
  WHERE timestamp >= v_start_time AND event_type = 'auth_failure';

  SELECT COUNT(*) INTO v_validation_errors
  FROM public.security_audit_logs
  WHERE timestamp >= v_start_time AND event_type = 'validation_error';

  SELECT COUNT(*) INTO v_suspicious_activity
  FROM public.security_audit_logs
  WHERE timestamp >= v_start_time AND event_type = 'suspicious_activity';

  -- Build response
  v_stats := jsonb_build_object(
    'total', v_total,
    'rateLimit', v_rate_limit,
    'authFailures', v_auth_failures,
    'validationErrors', v_validation_errors,
    'suspiciousActivity', v_suspicious_activity,
    'byType', jsonb_build_object(
      'rate_limit', v_rate_limit,
      'auth_failure', v_auth_failures,
      'validation_error', v_validation_errors,
      'suspicious_activity', v_suspicious_activity
    ),
    'bySeverity', (
      SELECT jsonb_object_agg(severity, count)
      FROM (
        SELECT severity, COUNT(*) as count
        FROM public.security_audit_logs
        WHERE timestamp >= v_start_time
        GROUP BY severity
      ) sub
    )
  );

  RETURN v_stats;
END;
$$;