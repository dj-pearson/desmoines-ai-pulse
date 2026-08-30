-- AOS-GOV-002: immutable agent action audit trail.
--
-- Every state-changing action an agent takes (DB writes, sends, publishes,
-- refunds, task/approval creation) is recorded here with a before/after diff.
-- Insert-only for the service role; admin read; NEVER updated. Mirrors the
-- security_audit_logs pattern. Additive only.

CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  -- Correlates to the run that took the action (automation_job_runs.id or the
  -- runtime run correlation id). Nullable for out-of-run helper writes.
  run_id UUID,
  action_type TEXT NOT NULL,
  -- What was acted on, e.g. 'agent_tasks:<id>', 'events:<id>', a URL.
  target_ref TEXT,
  before JSONB,
  after JSONB,
  actor TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_agent_created ON public.agent_audit_log (agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_action ON public.agent_audit_log (action_type);
CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON public.agent_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_run ON public.agent_audit_log (run_id) WHERE run_id IS NOT NULL;

ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin read-only. No INSERT/UPDATE/DELETE policies for authenticated users, so
-- only the service role (which bypasses RLS) can write — insert-only in practice.
DO $$ BEGIN
  CREATE POLICY "agent_audit_log_admin_read"
    ON public.agent_audit_log FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- True immutability: block UPDATE for EVERY role (including the service role, so
-- an agent bug can't rewrite history). DELETE is still allowed for the service
-- role only (retention), consistent with security_audit_logs.
CREATE OR REPLACE FUNCTION public.block_agent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent_audit_log is append-only; rows cannot be updated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_audit_log_no_update ON public.agent_audit_log;
CREATE TRIGGER agent_audit_log_no_update
  BEFORE UPDATE ON public.agent_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.block_agent_audit_update();

COMMENT ON TABLE public.agent_audit_log IS
  'Immutable agent action audit trail (AOS-GOV-002). Service-role insert only; admin read; UPDATE blocked by trigger.';
