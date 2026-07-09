-- Fix: the AOS control-plane audit writes (AOS-CORE-005/007/008) use event_type
-- values ('agent_task_routing', 'agent_control', 'agent_action_approval') that
-- the original security_audit_logs CHECK did not allow, so those best-effort
-- inserts were silently rejected. Widen the CHECK to include them. Widening a
-- CHECK (adding allowed values) is additive-safe per CLAUDE.md.

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT IF EXISTS security_audit_logs_event_type_check;

ALTER TABLE public.security_audit_logs
  ADD CONSTRAINT security_audit_logs_event_type_check
  CHECK (event_type IN (
    'rate_limit', 'auth_failure', 'validation_error', 'suspicious_activity', 'admin_action',
    'agent_task_routing', 'agent_control', 'agent_action_approval', 'security_anomaly'
  ));
