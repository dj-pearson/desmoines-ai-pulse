-- AOS-CORE-005: Escalation routing support.
--
-- Additive columns on agent_tasks so the escalation router can route a task to a
-- human queue (owner_role) and coalesce duplicates, plus a registry row for the
-- router agent itself. Additive/idempotent only.

ALTER TABLE public.agent_tasks
  -- Stable key for coalescing repeated escalations of the same underlying issue.
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  -- The human queue / owner_role the task is routed to (from agent_registry).
  ADD COLUMN IF NOT EXISTS queue TEXT,
  ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;

-- Fast dedupe lookup: open tasks by (agent_key, dedupe_key).
CREATE INDEX IF NOT EXISTS idx_agent_tasks_dedupe
  ON public.agent_tasks (agent_key, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('open', 'escalated', 'assigned', 'auto_resolving');

COMMENT ON COLUMN public.agent_tasks.dedupe_key IS
  'Stable coalescing key (AOS-CORE-005): repeated escalations with the same (agent_key, dedupe_key) are merged, not duplicated.';
COMMENT ON COLUMN public.agent_tasks.queue IS
  'Human queue / owner_role a tier-2/3 task is routed to (AOS-CORE-005).';

-- Register the escalation router as a governance agent so its runs show up in
-- the ledger and it can be governed like any other agent.
INSERT INTO public.agent_registry
  (agent_key, name, category, description, schedule_cron, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role)
VALUES
  ('escalation-router', 'Escalation Router', 'governance',
   'Routes tier-2/3 agent tasks to the right human queue by category (agent_registry.owner_role) and coalesces duplicates (AOS-CORE-005).',
   '*/10 * * * *', true, 0.95, NULL, 'root_admin')
ON CONFLICT (agent_key) DO NOTHING;

-- Schedule the router every 10 minutes (matches the registry schedule_cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent-escalation-router')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-escalation-router');

    PERFORM cron.schedule(
      'agent-escalation-router',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/agent-escalation-router',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
