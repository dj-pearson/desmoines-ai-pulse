-- AOS-CORE-003: Shared agent runtime harness support.
--
-- Two additive primitives the runtime (_shared/agentRuntime.ts) needs:
--   1. agent_action_log — the per-action audit trail. Every external/DB action
--      an agent takes inside the tool-calling loop is recorded here (the sink
--      AOS-GOV-002's governance console reads).
--   2. a global kill switch, stored as a feature flag, so all autonomous agents
--      can be halted at once (AOS-CORE-009 formalizes the console around it).
-- Additive/idempotent only — new table, new index, new RLS, new seeded flag.

-- 1) Agent action audit trail.
CREATE TABLE IF NOT EXISTS public.agent_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  -- Correlates every action in a single run; also written to the run ledger
  -- row's metadata so the two can be joined (AOS-CORE-002).
  run_correlation UUID,
  step INTEGER NOT NULL DEFAULT 0,
  tool_name TEXT,
  action TEXT NOT NULL,
  input JSONB,
  output_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_action_log_agent_created
  ON public.agent_action_log (agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_log_run
  ON public.agent_action_log (run_correlation)
  WHERE run_correlation IS NOT NULL;

ALTER TABLE public.agent_action_log ENABLE ROW LEVEL SECURITY;

-- Admin read-only; agents write via the service role (bypasses RLS).
DO $$ BEGIN
  CREATE POLICY "agent_action_log_admin_read"
    ON public.agent_action_log FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.agent_action_log IS
  'Per-action audit trail for autonomous agents (AOS-CORE-003 / AOS-GOV-002). Written by _shared/agentRuntime.ts via the service role; admin-read only.';

-- 2) Global kill switch as a feature flag. Default OFF (agents run). Flip
--    enabled = true to halt every agent that routes through runAgent.
INSERT INTO public.feature_flags (flag_key, enabled, description, target_tiers)
VALUES (
  'aos_kill_switch',
  false,
  'Global autonomous-agent kill switch (AOS-CORE-003/009). When enabled, runAgent returns early without acting.',
  ARRAY['admin']
)
ON CONFLICT (flag_key) DO NOTHING;
