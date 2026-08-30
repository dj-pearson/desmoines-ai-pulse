-- AOS-GOV-004: LLM-judge output quality scores. Every evaluation of agent-
-- generated user-facing content is recorded for later analysis + the dashboard.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.agent_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  category TEXT NOT NULL,
  score NUMERIC NOT NULL,          -- 0..100
  threshold NUMERIC NOT NULL,      -- per-category pass line
  passed BOOLEAN NOT NULL,
  dimensions JSONB,                -- per-rubric-dimension breakdown
  reasons TEXT,
  content_preview TEXT,            -- first ~280 chars of what was judged
  run_id UUID,
  task_id UUID,
  eval_cost_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_quality_agent_created ON public.agent_quality_scores (agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_quality_passed ON public.agent_quality_scores (passed);

ALTER TABLE public.agent_quality_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agent_quality_admin_read"
    ON public.agent_quality_scores FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.agent_quality_scores IS
  'LLM-judge quality scores for agent-generated content (AOS-GOV-004). Service-role insert; admin read.';

-- Per-agent 30-day quality rollup for the dashboard.
CREATE OR REPLACE VIEW public.agent_quality_summary AS
SELECT
  agent_key,
  round(avg(score)::numeric, 1)                         AS avg_score_30d,
  count(*)                                              AS evals_30d,
  count(*) FILTER (WHERE passed)                        AS passed_30d,
  count(*) FILTER (WHERE NOT passed)                    AS failed_30d,
  COALESCE(sum(eval_cost_usd), 0)                       AS eval_cost_30d
FROM public.agent_quality_scores
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY agent_key;

COMMENT ON VIEW public.agent_quality_summary IS
  'Per-agent 30-day average quality score + pass/fail counts (AOS-GOV-004).';
