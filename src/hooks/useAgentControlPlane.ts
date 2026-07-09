import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// agent_run_summary / automation_job_runs land in generated types after
// `supabase gen types` runs against the AOS migrations; narrow the client here.
const db = supabase as unknown as {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (cols?: string) => any;
  };
};

export interface AgentSummary {
  agent_key: string;
  name: string;
  category: string;
  enabled: boolean;
  monthly_cost_budget_usd: number | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_summary: string | null;
  runs_7d: number;
  successes_7d: number;
  failures_7d: number;
  escalations_7d: number;
  items_processed_7d: number;
  items_escalated_7d: number;
  cost_usd_7d: number;
  runs_30d: number;
  successes_30d: number;
  cost_usd_30d: number;
}

export interface AgentRun {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  items_processed: number;
  items_failed: number;
  items_escalated: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  error: string | null;
  summary: string | null;
}

/** All registered agents joined to their run rollups (control-plane list). */
export function useAgentSummaries() {
  return useQuery({
    queryKey: ["agent-summaries"],
    queryFn: async (): Promise<AgentSummary[]> => {
      const { data, error } = await db
        .from("agent_run_summary")
        .select("*")
        .order("category", { ascending: true })
        .order("agent_key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentSummary[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/** Recent run history for one agent (drill-in), newest first. */
export function useAgentRunHistory(agentKey: string | null, limit = 25) {
  return useQuery({
    queryKey: ["agent-run-history", agentKey, limit],
    queryFn: async (): Promise<AgentRun[]> => {
      const { data, error } = await db
        .from("automation_job_runs")
        .select("id, status, started_at, finished_at, items_processed, items_failed, items_escalated, tokens_used, cost_usd, error, summary")
        .eq("agent_key", agentKey)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AgentRun[];
    },
    enabled: !!agentKey,
    staleTime: 30 * 1000,
  });
}

export function useToggleAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentKey, enabled, actorId }: { agentKey: string; enabled: boolean; actorId: string }) => {
      const { data, error } = await supabase.functions.invoke("agent-control", {
        body: { mode: "toggle", agentKey, enabled, actorId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-summaries"] }),
  });
}

export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentKey, actorId }: { agentKey: string; actorId: string }) => {
      const { data, error } = await supabase.functions.invoke("agent-control", {
        body: { mode: "run", agentKey, actorId },
      });
      if (error) throw error;
      return data as { ok: boolean; notRunnable?: boolean; message?: string };
    },
    onSuccess: () => {
      // Give the triggered run a moment, then refresh rollups.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["agent-summaries"] }), 1500);
    },
  });
}

export function successRate(successes: number, runs: number): number | null {
  if (!runs) return null;
  return Math.round((successes / runs) * 100);
}
