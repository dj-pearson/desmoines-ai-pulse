import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SupportTicket {
  id: string;
  subject: string | null;
  body: string;
  channel: string;
  status: string;
  priority: string | null;
  sentiment: string | null;
  urgency: string | null;
  category: string | null;
  sla_due_at: string | null;
  classification_source: string | null;
  classification_confidence: number | null;
  classified_at: string | null;
  created_at: string;
}

export interface ReclassifyInput {
  id: string;
  sentiment?: string;
  urgency?: string;
  priority?: string;
  category?: string;
  actorId?: string;
}

/** All support tickets with classification (admin console, AOS-CS-005). */
export function useSupportTickets() {
  return useQuery({
    queryKey: ["support-tickets"],
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await supabase.functions.invoke("support/support-ticket-reclassify", { body: { action: "list" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.tickets ?? []) as SupportTicket[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/** Human correction of a ticket's classification (feedback captured). */
export function useReclassifyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReclassifyInput) => {
      const { data, error } = await supabase.functions.invoke("support/support-ticket-reclassify", {
        body: { action: "reclassify", ...input },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });
}
