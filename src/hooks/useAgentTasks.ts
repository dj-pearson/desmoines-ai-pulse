import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// NOTE: agent_tasks / agent_run_summary land in generated types after
// `supabase gen types` runs against the AOS-CORE-004..006 migrations. Until then
// we query through a locally-typed view of the client to avoid `any` leaking
// into call sites while keeping the row shapes strongly typed below.
const db = supabase as unknown as {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (cols?: string) => any;
    // deno-lint-ignore no-explicit-any
    update: (values: Record<string, unknown>) => any;
  };
};

export type AgentTaskStatus =
  | "open"
  | "auto_resolving"
  | "resolved"
  | "escalated"
  | "assigned"
  | "closed"
  | "failed";

export interface AgentTask {
  id: string;
  agent_key: string;
  category: string;
  tier: number;
  title: string;
  payload: Record<string, unknown> | null;
  confidence: number | null;
  status: AgentTaskStatus;
  assigned_to: string | null;
  queue: string | null;
  sla_due_at: string | null;
  routed_at: string | null;
  resolution: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunSummary {
  agent_key: string;
  name: string;
  category: string;
  last_run_at: string | null;
  last_status: string | null;
  last_items_processed: number | null;
  last_summary: string | null;
  runs_7d: number;
  successes_7d: number;
  failures_7d: number;
}

export type SlaFilter = "all" | "overdue" | "ok";

export interface AgentTaskFilters {
  tier?: number | "all";
  category?: string | "all";
  agentKey?: string | "all";
  sla?: SlaFilter;
}

const INBOX_STATUSES: AgentTaskStatus[] = ["escalated", "assigned"];

/** Inbox list: escalated + assigned tasks, filtered, newest SLA-critical first. */
export function useAgentTasks(filters: AgentTaskFilters = {}) {
  return useQuery({
    queryKey: ["agent-tasks", filters],
    queryFn: async (): Promise<AgentTask[]> => {
      let query = db
        .from("agent_tasks")
        .select("*")
        .in("status", INBOX_STATUSES);

      if (filters.tier && filters.tier !== "all") query = query.eq("tier", filters.tier);
      if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
      if (filters.agentKey && filters.agentKey !== "all") query = query.eq("agent_key", filters.agentKey);
      if (filters.sla === "overdue") query = query.lt("sla_due_at", new Date().toISOString());
      if (filters.sla === "ok") query = query.or(`sla_due_at.is.null,sla_due_at.gte.${new Date().toISOString()}`);

      // SLA-soonest first (nulls last), then newest.
      query = query.order("sla_due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AgentTask[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/** Distinct agent_keys present in the current inbox, for the agent filter. */
export function useInboxAgentKeys() {
  return useQuery({
    queryKey: ["agent-tasks", "agent-keys"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db
        .from("agent_tasks")
        .select("agent_key")
        .in("status", INBOX_STATUSES);
      if (error) throw error;
      const keys = new Set<string>((data ?? []).map((r: { agent_key: string }) => r.agent_key));
      return Array.from(keys).sort();
    },
    staleTime: 60 * 1000,
  });
}

/** The producing agent's latest run + 7-day rollup, for the task detail panel. */
export function useAgentRunSummary(agentKey: string | null) {
  return useQuery({
    queryKey: ["agent-run-summary", agentKey],
    queryFn: async (): Promise<AgentRunSummary | null> => {
      const { data, error } = await db
        .from("agent_run_summary")
        .select("*")
        .eq("agent_key", agentKey)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgentRunSummary | null;
    },
    enabled: !!agentKey,
    staleTime: 60 * 1000,
  });
}

/** Claim a task: assign it to the current admin and mark it assigned. */
export function useClaimTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, adminId }: { taskId: string; adminId: string }) => {
      const { error } = await db
        .from("agent_tasks")
        .update({ assigned_to: adminId, status: "assigned" })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-tasks"] }),
  });
}

/**
 * Resolve or close a task. Writes the resolution jsonb — including who acted and
 * when — which is the durable human-action audit for this row (created_at is
 * immutable; the router already audits the routing side server-side).
 */
export function useResolveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      adminId,
      outcome,
      notes,
    }: {
      taskId: string;
      adminId: string;
      outcome: "resolved" | "closed";
      notes?: string;
    }) => {
      const { error } = await db
        .from("agent_tasks")
        .update({
          status: outcome,
          resolution: {
            outcome,
            notes: notes ?? null,
            resolved_by: adminId,
            resolved_at: new Date().toISOString(),
          },
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-tasks"] }),
  });
}

/** True when a task's SLA has passed. */
export function isOverdue(task: Pick<AgentTask, "sla_due_at">): boolean {
  return !!task.sla_due_at && new Date(task.sla_due_at).getTime() < Date.now();
}
