import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';

const log = createLogger('useDomainHighlights');

type DomainHighlight = Database["public"]["Tables"]["domain_highlights"]["Row"];
type DomainHighlightInsert = Database["public"]["Tables"]["domain_highlights"]["Insert"];

interface DomainHighlightsState {
  domains: DomainHighlight[];
  isLoading: boolean;
  error: string | null;
}

export function useDomainHighlights() {
  const [state, setState] = useState<DomainHighlightsState>({
    domains: [],
    isLoading: true,
    error: null,
  });

  const fetchDomains = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabase
        .from("domain_highlights")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setState({
        domains: data || [],
        isLoading: false,
        error: null,
      });
    } catch (error) {
      log.error("Error fetching domain highlights", { action: 'fetchDomains', metadata: { error } });
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to fetch domains",
      }));
    }
  };

  const addDomain = async (domain: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from("domain_highlights")
        .insert({
          domain: domain.toLowerCase().trim(),
          description,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      fetchDomains();
      return data;
    } catch (error) {
      log.error("Error adding domain", { action: 'addDomain', metadata: { error } });
      throw error;
    }
  };

  const removeDomain = async (id: string) => {
    try {
      const { error } = await supabase
        .from("domain_highlights")
        .delete()
        .eq("id", id);

      if (error) throw error;

      fetchDomains();
    } catch (error) {
      log.error("Error removing domain", { action: 'removeDomain', metadata: { error } });
      throw error;
    }
  };

  const isHighlightedDomain = (url: string) => {
    if (!url) return false;
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return state.domains.some(d => domain.includes(d.domain.toLowerCase()));
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  return {
    ...state,
    refetch: fetchDomains,
    addDomain,
    removeDomain,
    isHighlightedDomain,
  };
}