import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ATTRACTION_LIST_COLUMNS } from "@/lib/listColumns";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";

const log = createLogger('useAttractions');

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];
type AttractionInsert = Database["public"]["Tables"]["attractions"]["Insert"];
type AttractionUpdate = Database["public"]["Tables"]["attractions"]["Update"];

interface AttractionsState {
  attractions: Attraction[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface AttractionFilters {
  search?: string;
  type?: string;
  minRating?: number;
  featuredOnly?: boolean;
  /** Admin-only: true = indoor-only, false = outdoor-only, undefined = both */
  indoorOnly?: boolean;
  /** Admin-only: true = kid-friendly only, false = not-kid-friendly only */
  kidFriendlyOnly?: boolean;
  /** Admin-only: true = free admission only */
  freeOnly?: boolean;
  /** Admin-only: when false, includes is_active=false rows. Defaults to true (active only) for back-compat. */
  activeOnly?: boolean;
  sortBy?: "newest" | "updated" | "alphabetical" | "rating";
  limit?: number;
  offset?: number;
}

export function useAttractions(filters: AttractionFilters = {}) {
  const queryClient = useQueryClient();

  // WEB-PERF-028. This was useState + useEffect, so nothing was cached across
  // navigation and every mount refetched. It also made the route invisible to
  // PrerenderSignal, which publishes data-queries-settled from useIsFetching()
  // -- a count of TanStack queries only. A hook outside that count reports
  // settled while its request is still in flight, which is how prerender.mjs
  // captured a skeleton on 2 of 4 builds.
  // The generic is explicit on purpose. ATTRACTION_LIST_COLUMNS is a projection,
  // so an inferred queryFn return type is NARROWER than Attraction -- and the
  // old AttractionsState declared Attraction[], which is what every caller is
  // typed against. Without this, 34 errors appear in Attractions.tsx and
  // AttractionManager.tsx for a change that alters no runtime value.
  const { data, isLoading, error } = useQuery<{
    attractions: Attraction[];
    totalCount: number;
  }>({
    queryKey: queryKeys.attractions.list(filters as Record<string, unknown>),
    queryFn: async () => {
      let query = supabase.from("attractions").select(ATTRACTION_LIST_COLUMNS, { count: "exact" });

      // Default to active rows only; admin callers can pass false to see all.
      if (filters.activeOnly !== false) {
        query = query.eq("is_active", true);
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,type.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }

      if (filters.type && filters.type !== "all") {
        query = query.eq("type", filters.type);
      }

      if (filters.minRating) {
        query = query.gte("rating", filters.minRating);
      }

      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
      }

      if (filters.indoorOnly === true) {
        query = query.eq("is_indoor", true);
      } else if (filters.indoorOnly === false) {
        query = query.eq("is_indoor", false);
      }

      if (filters.kidFriendlyOnly === true) {
        query = query.eq("is_kid_friendly", true);
      }

      if (filters.freeOnly === true) {
        query = query.eq("is_free", true);
      }

      switch (filters.sortBy ?? "newest") {
        case "updated":
          query = query.order("updated_at", { ascending: false });
          break;
        case "alphabetical":
          query = query.order("name", { ascending: true });
          break;
        case "rating":
          query = query.order("rating", { ascending: false, nullsFirst: false });
          break;
        case "newest":
        default:
          query = query.order("created_at", { ascending: false });
          break;
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

      return { attractions: (data || []) as unknown as Attraction[], totalCount: count || 0 };
    },
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  // Mutations below called fetchAttractions() to refresh. Invalidating the list
  // key does the same job and also refreshes any other mounted view of it.
  const fetchAttractions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.attractions.lists() });
  }, [queryClient]);

  const createAttraction = async (attraction: AttractionInsert) => {
    try {
      const { data, error } = await supabase
        .from("attractions")
        .insert(attraction)
        .select()
        .single();

      if (error) throw error;

      fetchAttractions();
      return data;
    } catch (error) {
      log.error('createAttraction', 'Error creating attraction', { error });
      throw error;
    }
  };

  const updateAttraction = async (id: string, updates: AttractionUpdate) => {
    try {
      const { data, error } = await supabase
        .from("attractions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchAttractions();
      return data;
    } catch (error) {
      log.error('updateAttraction', 'Error updating attraction', { error });
      throw error;
    }
  };

  const deleteAttraction = async (id: string) => {
    try {
      const { error } = await supabase.from("attractions").delete().eq("id", id);

      if (error) throw error;

      fetchAttractions();
    } catch (error) {
      log.error('deleteAttraction', 'Error deleting attraction', { error });
      throw error;
    }
  };


  // The exact surface callers already read, rebuilt from the query, so this
  // lands without touching a single page.
  return {
    attractions: data?.attractions ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch attractions") : null,
    refetch: fetchAttractions,
    createAttraction,
    updateAttraction,
    deleteAttraction,
  };
}