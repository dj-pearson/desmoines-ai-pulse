import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HubFactRow } from "@/lib/attractionAtAGlance";

/**
 * The verified-fact columns of every active attraction, for the /attractions
 * intro and free-admission list (SEO-046). Separate from useAttractions on
 * purpose: that query carries the visitor's filters, and "N attractions
 * checked against their own sites" describes the whole catalogue, not the
 * current view. Four narrow columns over a couple of dozen rows.
 */
export function useAttractionFacts() {
  return useQuery({
    queryKey: ["attraction-facts"],
    queryFn: async (): Promise<HubFactRow[]> => {
      const { data, error } = await supabase
        .from("attractions")
        .select("name, is_free, fact_sources, facts_verified_at")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as HubFactRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
