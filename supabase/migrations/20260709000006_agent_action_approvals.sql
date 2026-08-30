-- AOS-CORE-007: Human-in-the-loop approval queue for agent-proposed actions.
--
-- Some actions (publishing, outreach, refunds, destructive fixes) must not run
-- unattended. A guarded action creates a pending approval and stops; a human
-- approves (which executes it) or rejects (with a reason). Additive only.

DO $$ BEGIN
  CREATE TYPE agent_approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.agent_action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL REFERENCES public.agent_registry(agent_key) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  proposed_payload JSONB,
  status agent_approval_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  reason TEXT,
  -- Result of executing the action after approval (executor output / error).
  execution_result JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON public.agent_action_approvals (status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_agent ON public.agent_action_approvals (agent_key);
-- "Pending, soonest-expiring first" — the console's primary query and the
-- expiry sweep's scan.
CREATE INDEX IF NOT EXISTS idx_agent_approvals_pending_expiry
  ON public.agent_action_approvals (expires_at NULLS LAST)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_agent_approvals_updated_at ON public.agent_action_approvals;
CREATE TRIGGER set_agent_approvals_updated_at
  BEFORE UPDATE ON public.agent_action_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS freeze_agent_approvals_created_at ON public.agent_action_approvals;
CREATE TRIGGER freeze_agent_approvals_created_at
  BEFORE UPDATE ON public.agent_action_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_created_at();

ALTER TABLE public.agent_action_approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agent_approvals_admin_read"
    ON public.agent_action_approvals FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "agent_approvals_admin_update"
    ON public.agent_action_approvals FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.agent_action_approvals IS
  'Human-in-the-loop approval queue for risky agent actions (AOS-CORE-007). Written by the service role; admin read/update. created_at immutable.';

-- Register the approval sweep/executor as a governance agent (runs the expiry +
-- re-escalation sweep and executes approved actions on demand).
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role)
VALUES
  ('approval-sweeper', 'Approval Sweeper', 'governance',
   'Expires stale pending approvals and re-escalates them; executes approved actions (AOS-CORE-007).',
   '*/15 * * * *', true, 0.95, NULL, 'root_admin')
ON CONFLICT (agent_key) DO NOTHING;

-- Schedule the expiry/re-escalation sweep every 15 minutes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('approval-sweeper')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'approval-sweeper');

    PERFORM cron.schedule(
      'approval-sweeper',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-approvals',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{"mode":"sweep"}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
