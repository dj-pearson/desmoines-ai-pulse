import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// agent_audit_log lands in generated types after `supabase gen types`; narrow
// the client here until then.
const db = supabase as unknown as {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (cols?: string) => any;
  };
};

export interface AgentAuditEntry {
  id: string;
  agent_key: string;
  run_id: string | null;
  action_type: string;
  target_ref: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  shadow: boolean;
  created_at: string;
}

export interface AuditFilters {
  agentKey?: string | "all";
  action?: string;
  since?: string; // ISO date (yyyy-mm-dd)
}

export function useAgentAuditLog(filters: AuditFilters = {}, limit = 100) {
  return useQuery({
    queryKey: ["agent-audit", filters, limit],
    queryFn: async (): Promise<AgentAuditEntry[]> => {
      let q = db.from("agent_audit_log").select("*");
      if (filters.agentKey && filters.agentKey !== "all") q = q.eq("agent_key", filters.agentKey);
      if (filters.action && filters.action.trim()) q = q.ilike("action_type", `%${filters.action.trim()}%`);
      if (filters.since) q = q.gte("created_at", new Date(filters.since).toISOString());
      q = q.order("created_at", { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AgentAuditEntry[];
    },
    staleTime: 30 * 1000,
  });
}

/** Distinct agent keys present in the audit log (for the agent filter). */
export function useAuditAgentKeys() {
  return useQuery({
    queryKey: ["agent-audit", "agent-keys"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db
        .from("agent_audit_log")
        .select("agent_key")
        .order("agent_key", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const keys = new Set<string>((data ?? []).map((r: { agent_key: string }) => r.agent_key));
      return Array.from(keys).sort();
    },
    staleTime: 60 * 1000,
  });
}
