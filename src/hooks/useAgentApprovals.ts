import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// agent_action_approvals lands in generated types after `supabase gen types`
// runs against the AOS-CORE-007 migration; narrow the client here until then.
const db = supabase as unknown as {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (cols?: string) => any;
  };
};

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface AgentActionApproval {
  id: string;
  agent_key: string;
  action_type: string;
  proposed_payload: Record<string, unknown> | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  execution_result: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
}

/** Pending approvals, soonest-expiring first. */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ["agent-approvals", "pending"],
    queryFn: async (): Promise<AgentActionApproval[]> => {
      const { data, error } = await db
        .from("agent_action_approvals")
        .select("*")
        .eq("status", "pending")
        .order("expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AgentActionApproval[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Approve or reject an approval. Approve routes through the agent-approvals edge
 * function so the queued action is actually executed server-side (a direct table
 * update could not run the action).
 */
export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      approvalId,
      decision,
      reason,
      decidedBy,
    }: {
      approvalId: string;
      decision: "approve" | "reject";
      reason?: string;
      decidedBy: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("agent-approvals", {
        body: { mode: decision, approvalId, reason, decidedBy },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-approvals"] }),
  });
}

export function isExpiringSoon(a: Pick<AgentActionApproval, "expires_at">, withinMs = 60 * 60 * 1000): boolean {
  if (!a.expires_at) return false;
  const ms = new Date(a.expires_at).getTime() - Date.now();
  return ms > 0 && ms < withinMs;
}
