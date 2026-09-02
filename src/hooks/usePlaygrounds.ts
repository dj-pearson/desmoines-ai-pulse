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
  /** Substring match on `location`, matching how the suburb chips are derived. */
  location?: string;
  featuredOnly?: boolean;
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

      // WEB-PERF-028 AC4. Substring, not equality: the suburb chips on
      // /playgrounds are derived by splitting the `location` string, so "Ankeny"
      // has to match "1234 Main St, Ankeny, IA".
      if (filters.location) {
        query = query.ilike("location", `%${filters.location}%`);
      }

      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
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

/**
 * The facet values the /playgrounds filter controls offer, over the WHOLE
 * catalogue (WEB-PERF-028 AC4).
 *
 * The page derived age ranges, suburbs and amenities from the full unfiltered
 * list it happened to be holding. That is what kept its filters client-side:
 * filter the list and the dropdowns lose their other options. Three columns
 * answer all of it, against 40-odd on the rows themselves.
 *
 * The suburb list is built the same way the page built it -- second-to-last
 * comma-separated segment of `location`, falling back to the first -- because
 * that value is what the filter then substring-matches against.
 */
export function usePlaygroundFacets() {
  const { data, isLoading } = useQuery<{
    ageRanges: string[];
    locations: string[];
    amenities: string[];
    ageRangeCounts: Record<string, number>;
    amenityCounts: Record<string, number>;
  }>({
    queryKey: [...queryKeys.playgrounds.all, "facets"] as const,
    staleTime: STALE_TIME.REFERENCE,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playgrounds")
        .select("age_range,location,amenities");

      if (error) {
        console.error("Error fetching playground facets:", error);
        throw error;
      }

      const rows = (data || []) as {
        age_range: string | null;
        location: string | null;
        amenities: string[] | null;
      }[];

      const ageRangeCounts: Record<string, number> = {};
      const amenityCounts: Record<string, number> = {};
      const suburbs = new Set<string>();

      for (const row of rows) {
        if (row.age_range) {
          ageRangeCounts[row.age_range] = (ageRangeCounts[row.age_range] || 0) + 1;
        }
        if (row.location) {
          const parts = row.location.split(",");
          const suburb = parts[parts.length - 2]?.trim() || parts[0]?.trim() || row.location;
          suburbs.add(suburb);
        }
        for (const a of row.amenities || []) {
          amenityCounts[a] = (amenityCounts[a] || 0) + 1;
        }
      }

      return {
        ageRanges: Object.keys(ageRangeCounts).sort(),
        locations: Array.from(suburbs).sort(),
        amenities: Object.keys(amenityCounts).sort(),
        ageRangeCounts,
        amenityCounts,
      };
    },
  });

  return {
    ageRanges: data?.ageRanges ?? [],
    locations: data?.locations ?? [],
    amenities: data?.amenities ?? [],
    ageRangeCounts: data?.ageRangeCounts ?? {},
    amenityCounts: data?.amenityCounts ?? {},
    isLoading,
  };
}
