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

/** Current global pause state (aos_kill_switch feature flag). */
export function useGlobalPause() {
  return useQuery({
    queryKey: ["aos-global-pause"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db
        .from("feature_flags")
        .select("enabled")
        .eq("flag_key", "aos_kill_switch")
        .maybeSingle();
      if (error) throw error;
      return (data as { enabled?: boolean } | null)?.enabled === true;
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useSetGlobalPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paused, actorId }: { paused: boolean; actorId: string }) => {
      const { data, error } = await supabase.functions.invoke("agent-control", {
        body: { mode: "global_pause", paused, actorId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aos-global-pause"] });
      qc.invalidateQueries({ queryKey: ["agent-summaries"] });
    },
  });
}

export interface AgentQuality {
  agent_key: string;
  avg_score_30d: number;
  evals_30d: number;
  passed_30d: number;
  failed_30d: number;
}

/** Per-agent 30-day quality rollup (AOS-GOV-004). Keyed by agent_key. */
export function useAgentQuality() {
  return useQuery({
    queryKey: ["agent-quality"],
    queryFn: async (): Promise<Record<string, AgentQuality>> => {
      const { data, error } = await db.from("agent_quality_summary").select("*");
      if (error) throw error;
      const map: Record<string, AgentQuality> = {};
      for (const r of (data ?? []) as AgentQuality[]) map[r.agent_key] = r;
      return map;
    },
    staleTime: 60 * 1000,
  });
}

export interface AgentMonthSpend {
  agent_key: string;
  name: string;
  category: string;
  monthly_cost_budget_usd: number | null;
  spend_mtd: number;
  tokens_mtd: number;
  runs_mtd: number;
}

/** Per-agent month-to-date spend vs budget (AOS-GOV-001 budget tile). */
export function useMonthlySpend() {
  return useQuery({
    queryKey: ["agent-month-spend"],
    queryFn: async (): Promise<AgentMonthSpend[]> => {
      const { data, error } = await db
        .from("agent_month_spend")
        .select("*")
        .order("spend_mtd", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentMonthSpend[];
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export interface AgentConfigRow {
  agent_key: string;
  category: string;
  tier1_confidence_threshold: number;
  monthly_cost_budget_usd: number | null;
  auto_override: boolean;
  mode: "shadow" | "live";
}

/** agent_key -> mode (shadow|live), for badges on the dashboard list. */
export function useAgentModes() {
  return useQuery({
    queryKey: ["agent-modes"],
    queryFn: async (): Promise<Record<string, "shadow" | "live">> => {
      const { data, error } = await db.from("agent_registry").select("agent_key, mode");
      if (error) throw error;
      const map: Record<string, "shadow" | "live"> = {};
      for (const r of (data ?? []) as { agent_key: string; mode: "shadow" | "live" }[]) map[r.agent_key] = r.mode;
      return map;
    },
    staleTime: 30 * 1000,
  });
}

/** Categories where a low tier-1 threshold is gated by the 0.80 safety floor. */
export const SENSITIVE_CATEGORIES = new Set(["security", "manage"]);
export const THRESHOLD_FLOOR = 0.8;

/** The editable registry config for one agent (threshold, budget, override). */
export function useAgentConfigRow(agentKey: string | null) {
  return useQuery({
    queryKey: ["agent-config-row", agentKey],
    queryFn: async (): Promise<AgentConfigRow | null> => {
      const { data, error } = await db
        .from("agent_registry")
        .select("agent_key, category, tier1_confidence_threshold, monthly_cost_budget_usd, auto_override, mode")
        .eq("agent_key", agentKey)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgentConfigRow | null;
    },
    enabled: !!agentKey,
    staleTime: 15 * 1000,
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      agentKey: string;
      actorId: string;
      tier1ConfidenceThreshold?: number;
      monthlyCostBudgetUsd?: number | null;
      autoOverride?: boolean;
      agentMode?: "shadow" | "live";
    }) => {
      const { agentMode, ...rest } = args;
      const { data, error } = await supabase.functions.invoke("agent-control", {
        // `mode` selects the edge-function operation; `agentMode` is the value we
        // want to set on the agent (renamed to avoid clashing with the op field).
        body: { mode: "update_config", ...rest, ...(agentMode ? { agentMode } : {}) },
      });
      // Surface the edge function's 422 safety-floor message to the caller.
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["agent-summaries"] });
      qc.invalidateQueries({ queryKey: ["agent-config-row", vars.agentKey] });
    },
  });
}

export function successRate(successes: number, runs: number): number | null {
  if (!runs) return null;
  return Math.round((successes / runs) * 100);
}
