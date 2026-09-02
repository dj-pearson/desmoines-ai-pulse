import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";

type Playground = Database["public"]["Tables"]["playgrounds"]["Row"];
type PlaygroundInsert = Database["public"]["Tables"]["playgrounds"]["Insert"];
type PlaygroundUpdate = Database["public"]["Tables"]["playgrounds"]["Update"];

interface PlaygroundsState {
  playgrounds: Playground[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface PlaygroundFilters {
  search?: string;
  age_range?: string;
  /** Admin-only: filter by source label */
  source?: "google_places" | "manual";
  /** Admin-only: only manually-curated rows */
  manuallyCuratedOnly?: boolean;
  sortBy?: "newest" | "updated" | "alphabetical" | "name";
  limit?: number;
  offset?: number;
}

export function usePlaygrounds(filters: PlaygroundFilters = {}) {
  const queryClient = useQueryClient();

  // WEB-PERF-028. See useAttractions for the full note. The explicit generic is
  // required: the old PlaygroundsState declared Playground[], and letting the
  // queryFn's return type be inferred narrows it for every caller.
  const { data, isLoading, error } = useQuery<{
    playgrounds: Playground[];
    totalCount: number;
  }>({
    queryKey: queryKeys.playgrounds.list(filters as Record<string, unknown>),
    queryFn: async () => {
      let query = supabase.from("playgrounds").select("*", { count: "exact" });

      switch (filters.sortBy ?? "newest") {
        case "updated":
          query = query.order("updated_at", { ascending: false });
          break;
        case "alphabetical":
        case "name":
          query = query.order("name", { ascending: true });
          break;
        case "newest":
        default:
          query = query.order("created_at", { ascending: false });
          break;
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,location.ilike.%${filters.search}%,age_range.ilike.%${filters.search}%`
        );
      }

      if (filters.age_range) {
        query = query.eq("age_range", filters.age_range);
      }

      if (filters.source) {
        query = query.eq("source", filters.source);
      }

      if (filters.manuallyCuratedOnly) {
        query = query.eq("manually_curated", true);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 10) - 1
        );
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        playgrounds: (data || []) as unknown as Playground[],
        totalCount: count || 0,
      };
    },
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  // Mutations below called fetchPlaygrounds() to refresh. Invalidating the list
  // key does that and refreshes any other mounted view of it too.
  const fetchPlaygrounds = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.playgrounds.lists() });
  }, [queryClient]);

  const createPlayground = async (playground: PlaygroundInsert) => {
    try {
      const { data, error } = await supabase
        .from("playgrounds")
        .insert(playground)
        .select()
        .single();

      if (error) throw error;

      fetchPlaygrounds();
      return data;
    } catch (error) {
      console.error("Error creating playground:", error);
      throw error;
    }
  };

  const updatePlayground = async (id: string, updates: PlaygroundUpdate) => {
    try {
      const { data, error } = await supabase
        .from("playgrounds")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchPlaygrounds();
      return data;
    } catch (error) {
      console.error("Error updating playground:", error);
      throw error;
    }
  };

  const deletePlayground = async (id: string) => {
    try {
      const { error } = await supabase.from("playgrounds").delete().eq("id", id);

      if (error) throw error;

      fetchPlaygrounds();
    } catch (error) {
      console.error("Error deleting playground:", error);
      throw error;
    }
  };


  // The exact surface callers already read, rebuilt from the query.
  return {
    playgrounds: data?.playgrounds ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch playgrounds") : null,
    refetch: fetchPlaygrounds,
    createPlayground,
    updatePlayground,
    deletePlayground,
  };
}