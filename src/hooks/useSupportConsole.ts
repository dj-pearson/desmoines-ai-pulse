import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConsoleTicket {
  id: string;
  subject: string | null;
  body: string;
  channel: string;
  status: string;
  priority: string | null;
  sentiment: string | null;
  urgency: string | null;
  category: string | null;
  assigned_to: string | null;
  sla_due_at: string | null;
  csat_score: number | null;
  created_at: string;
}

export interface ThreadMessage {
  id: string;
  sender: string;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  category: string | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("support-console", { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
}

export function useConsoleTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ["support-console-tickets", filters],
    queryFn: () => invoke<{ tickets: ConsoleTicket[] }>({ action: "list", ...filters }).then((r) => r.tickets),
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useTicketThread(id: string | null) {
  return useQuery({
    queryKey: ["support-console-thread", id],
    queryFn: () => invoke<{ ticket: ConsoleTicket; messages: ThreadMessage[]; context: Record<string, unknown> }>({ action: "thread", id }),
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}

export function useCannedResponses() {
  return useQuery({
    queryKey: ["support-console-canned"],
    queryFn: () => invoke<{ canned: CannedResponse[] }>({ action: "canned" }).then((r) => r.canned),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSuggestReply() {
  return useMutation({
    mutationFn: (id: string) => invoke<{ draft: string; sources: string[] }>({ action: "suggest_reply", id }),
  });
}

export function useConsoleAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => invoke<{ ok: boolean }>(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-console-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-console-thread"] });
    },
  });
}
