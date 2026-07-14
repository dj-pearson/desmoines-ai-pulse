import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  source: string | null;
  category: string | null;
  is_active: boolean;
  needs_embedding: boolean;
  updated_at: string;
}

export interface KbPassage {
  id: string;
  title: string;
  content: string;
  source: string | null;
  category: string | null;
  similarity: number;
}

export interface KbUpsert {
  id?: string;
  title: string;
  content: string;
  source?: string | null;
  category?: string | null;
  is_active?: boolean;
}

/** List all KB articles (admin console) via the service-role CRUD function. */
export function useKbArticles() {
  return useQuery({
    queryKey: ["support-kb-articles"],
    queryFn: async (): Promise<KbArticle[]> => {
      const { data, error } = await supabase.functions.invoke("support/support-kb-admin", { body: { action: "list" } });
      if (error) throw error;
      return (data?.articles ?? []) as KbArticle[];
    },
    staleTime: 30 * 1000,
  });
}

/** Create or update an article; the edit re-embeds automatically server-side. */
export function useUpsertKbArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (article: KbUpsert) => {
      const { data, error } = await supabase.functions.invoke("support/support-kb-admin", {
        body: { action: "upsert", ...article },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-kb-articles"] }),
  });
}

export function useDeleteKbArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("support/support-kb-admin", { body: { action: "delete", id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-kb-articles"] }),
  });
}

/** Test grounded retrieval against the KB (returns passages with sources). */
export function useKbSearch() {
  return useMutation({
    mutationFn: async (query: string): Promise<KbPassage[]> => {
      const { data, error } = await supabase.functions.invoke("support/support-kb-search", { body: { query } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.passages ?? []) as KbPassage[];
    },
  });
}
