-- Non-core review WP5 (admin): a write path to security_audit_logs that an
-- admin's browser can use without the table accepting inserts from anyone.
--
-- security_audit_logs has two INSERT policies with WITH CHECK (true)
-- ("System can insert security audit logs", 20250805134517, and "Service role
-- can insert audit logs", 20251109000000). Neither is limited to a role, so
-- any signed-in or anonymous caller can write a row with any user_id, and the
-- admin audit view shows it as fact.
--
-- This migration only ADDS the replacement. The browser writers
-- (NewsletterSubscribersManager, EventSubmissionsManager, useAuditLog,
-- useSecurityAudit) move to it in the same release. Dropping the two
-- permissive policies is a tightening and waits for the next release; see
-- WP5 in docs/plans/NON_CORE_REVIEW_2026-09.md.
--
-- The actor is auth.uid(), never a parameter. Severity outside
-- low/medium/high is stored as 'low' rather than rejected: the browser
-- writers sent 'info', which the severity CHECK refuses, so their rows were
-- never stored.

CREATE OR REPLACE FUNCTION public.record_admin_audit(
  p_action text,
  p_resource text,
  p_details jsonb DEFAULT NULL,
  p_severity text DEFAULT 'low',
  p_event_type text DEFAULT 'admin_action'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_event_type NOT IN (
    'admin_action', 'suspicious_activity', 'validation_error',
    'auth_failure', 'rate_limit', 'security_anomaly'
  ) THEN
    RAISE EXCEPTION 'event_type % is not writable here', p_event_type
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.security_audit_logs (
    event_type, identifier, user_id, action, resource, details, severity
  ) VALUES (
    p_event_type,
    v_actor::text,
    v_actor,
    left(p_action, 200),
    left(p_resource, 200),
    COALESCE(p_details, '{}'::jsonb),
    CASE WHEN p_severity IN ('low', 'medium', 'high') THEN p_severity ELSE 'low' END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_admin_audit(text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_audit(text, text, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION public.record_admin_audit(text, text, jsonb, text, text) IS
  'Admin-only audit write. Actor is auth.uid(). Replaces direct browser inserts into security_audit_logs (WP5).';
