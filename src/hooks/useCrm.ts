import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CrmLead {
  id: string;
  business_name: string;
  category: string | null;
  status: string;
  fit_score: number | null;
  next_action: string | null;
  next_action_at: string | null;
  account_id: string | null;
  created_at: string;
}

export interface CrmOpportunity {
  id: string;
  name: string;
  stage: string;
  value: number;
  next_action: string | null;
  account_id: string | null;
  campaign_id: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface CrmAccount {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  website: string | null;
  advertiser_user_id: string | null;
}

export interface CrmProposal {
  id: string;
  opportunity_id: string;
  status: string;
  created_at: string;
}

interface Board {
  leads: CrmLead[];
  opportunities: CrmOpportunity[];
  accounts: CrmAccount[];
  proposals: CrmProposal[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-console", { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function useCrmBoard() {
  return useQuery({
    queryKey: ["crm-board"],
    queryFn: () => invoke<Board>({ action: "board" }),
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useCrmAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => invoke<{ ok: boolean }>(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-board"] }),
  });
}

/** Generate a proposal draft for an opportunity, then open it. */
export function useProposal() {
  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: (opportunityId: string) =>
      supabase.functions.invoke("generate-proposal", { body: { opportunityId } }).then(({ data, error }) => {
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
        return data as { proposalId: string };
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-board"] }),
  });
  async function openProposal(id: string) {
    const html = await invoke<{ proposal: { html: string } }>({ action: "get_proposal", id }).then((r) => r.proposal?.html ?? "");
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }
  return { generate, openProposal };
}

export const CRM_STAGES = ["new", "qualified", "contacted", "proposal", "won", "lost"] as const;
