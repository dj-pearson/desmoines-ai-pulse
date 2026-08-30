-- AOS-CORE-004: Tiered task + escalation data model.
--
-- A shared record for every work item an agent produces, classified tier-1
-- (auto-resolve) vs tier-2/3 (human) with a confidence score and an SLA. The
-- whole OS depends on this consistent auto-vs-escalate contract.
-- Additive only: new enum, new table, new triggers, new RLS, new view.

-- 1) Task lifecycle enum.
DO $$ BEGIN
  CREATE TYPE agent_task_status AS ENUM (
    'open',            -- created, not yet routed
    'auto_resolving',  -- tier-1: an agent is handling it autonomously
    'resolved',        -- completed successfully (auto or human)
    'escalated',       -- routed to a human tier, awaiting pickup
    'assigned',        -- picked up by a specific human
    'closed',          -- closed without a resolution (dismissed / no-op)
    'failed'           -- auto attempt failed; usually then escalated
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Task table.
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL REFERENCES public.agent_registry(agent_key) ON DELETE CASCADE,
  category agent_category NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  payload JSONB,
  confidence NUMERIC,
  status agent_task_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sla_due_at TIMESTAMPTZ,
  resolution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON public.agent_tasks (agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON public.agent_tasks (status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tier ON public.agent_tasks (tier);
-- "Open human work, soonest SLA first" — the console's primary query.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_open_sla
  ON public.agent_tasks (sla_due_at NULLS LAST)
  WHERE status IN ('escalated', 'assigned', 'open');

-- 3) updated_at maintenance + created_at immutability.
DROP TRIGGER IF EXISTS set_agent_tasks_updated_at ON public.agent_tasks;
CREATE TRIGGER set_agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.freeze_created_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS freeze_agent_tasks_created_at ON public.agent_tasks;
CREATE TRIGGER freeze_agent_tasks_created_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_created_at();

-- 4) RLS: agents write via the service role (bypasses RLS); admins read + update.
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agent_tasks_admin_read"
    ON public.agent_tasks FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "agent_tasks_admin_update"
    ON public.agent_tasks FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.agent_tasks IS
  'Tiered work items produced by agents (AOS-CORE-004). tier 1 = auto-resolve; tier 2/3 = human. Written by the service role; admin read/update. created_at is immutable.';

-- 5) Overdue view for the escalation console: open human work past its SLA.
CREATE OR REPLACE VIEW public.agent_tasks_overdue AS
SELECT
  t.*,
  now() - t.sla_due_at AS overdue_by
FROM public.agent_tasks t
WHERE t.sla_due_at IS NOT NULL
  AND t.sla_due_at < now()
  AND t.status IN ('open', 'escalated', 'assigned');

COMMENT ON VIEW public.agent_tasks_overdue IS
  'Open/assigned agent tasks past their SLA, for the escalation console (AOS-CORE-004/006).';
