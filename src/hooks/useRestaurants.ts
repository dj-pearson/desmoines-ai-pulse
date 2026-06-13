import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { getRestaurantRotationSeed } from "@/lib/restaurantRotation";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantInsert = Database["public"]["Tables"]["restaurants"]["Insert"];
type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];

// WEB-PERF-001: list/direct-query path fetches only card + admin-list columns,
// not select('*'). Heavy detail-only fields (seo_*, geo_summary/geo_key_facts/
// geo_faq, ai_writeup/writeup_*, enhanced, source_url, geom, search_vector,
// data_quality_score) are dropped. The restaurant DETAIL page runs its own
// select('*') query, and the default popularity path (get_rotated_restaurants)
// strips the same heavy keys inside the RPC. `satisfies` validates names.
const RESTAURANT_LIST_COLUMNS = [
  "id",
  "slug",
  "name",
  "description",
  "cuisine",
  "price_range",
  "location",
  "city",
  "rating",
  "image_url",
  "phone",
  "website",
  "latitude",
  "longitude",
  "popularity_score",
  "is_featured",
  "is_sponsored",
  "sponsored_until",
  "status",
  "opening",
  "opening_date",
  "opening_timeframe",
  "created_at",
  "updated_at",
] satisfies readonly (keyof Restaurant)[];

const RESTAURANT_LIST_SELECT = RESTAURANT_LIST_COLUMNS.join(", ");

interface RestaurantsState {
  restaurants: Restaurant[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface RestaurantFilters {
  search?: string;
  cuisine?: string[];
  priceRange?: string[];
  rating?: number[];
  location?: string[];
  sortBy?:
    | "popularity"
    | "rating"
    | "newest"
    | "alphabetical"
    | "price_low"
    | "price_high";
  featuredOnly?: boolean;
  openNow?: boolean;
  tags?: string[];
  dietary?: string[];
  limit?: number;
  offset?: number;
  /**
   * WEB-PERF-001: list payloads are column-projected to card fields by default
   * (the rotation RPC strips the same heavy keys). Admin surfaces that need the
   * heavy detail fields (ContentTable's SEO / AI-writeup / source columns) pass
   * `fullColumns: true`, which forces the direct select('*') path.
   */
  fullColumns?: boolean;
}

export function useRestaurants(filters: RestaurantFilters = {}) {
  const [state, setState] = useState<RestaurantsState>({
    restaurants: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchRestaurants = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Default popularity sort goes through the rotation RPC so the top of
      // the list isn't the same every visit. Other sorts (rating, newest, A-Z,
      // price) stay deterministic — users picked them explicitly.
      // Dietary filtering still runs via the regular query path because the
      // RPC doesn't model the description/cuisine ILIKE fan-out.
      const sortBy = filters.sortBy || "popularity";
      const useRotationRpc =
        sortBy === "popularity" &&
        (!filters.dietary || filters.dietary.length === 0) &&
        // The rotation RPC returns column-projected rows; admin callers that
        // need the heavy detail fields force the direct select('*') path.
        !filters.fullColumns;

      if (useRotationRpc) {
        const limit = filters.limit ?? 1000;
        const offset = filters.offset ?? 0;
        // Cast: get_rotated_restaurants is added in a new migration and is
        // not yet in the generated Database types.
        const { data: rpcData, error: rpcError } = await (
          supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>
          ) => Promise<{
            data:
              | Array<{
                  restaurant_data: Restaurant;
                  total_count: number | string;
                }>
              | null;
            error: { message: string } | null;
          }>
        )("get_rotated_restaurants", {
          rotation_seed: getRestaurantRotationSeed(),
          search_query: filters.search || null,
          cuisine_filter:
            filters.cuisine && filters.cuisine.length > 0
              ? filters.cuisine
              : null,
          price_filter:
            filters.priceRange && filters.priceRange.length > 0
              ? filters.priceRange
              : null,
          location_filter:
            filters.location && filters.location.length > 0
              ? filters.location
              : null,
          min_rating:
            filters.rating && filters.rating.length === 2
              ? filters.rating[0]
              : null,
          max_rating:
            filters.rating && filters.rating.length === 2
              ? filters.rating[1]
              : null,
          featured_only: !!filters.featuredOnly,
          limit_count: limit,
          offset_count: offset,
        });

        if (!rpcError && rpcData) {
          setState({
            restaurants: rpcData.map((r) => r.restaurant_data),
            isLoading: false,
            error: null,
            totalCount:
              rpcData.length > 0 ? Number(rpcData[0].total_count) : 0,
          });
          return;
        }
        // Fall through to the legacy query path on RPC error so the page
        // still renders if the migration hasn't been applied yet.
        if (rpcError) {
          console.warn(
            "useRestaurants: rotation RPC failed, falling back to direct query",
            rpcError
          );
        }
      }

      // Direct-query path (non-default sorts / dietary). The default popularity
      // path uses get_rotated_restaurants, which filters is_merged server-side.
      let query = supabase
        .from("restaurants")
        .select(filters.fullColumns ? "*" : RESTAURANT_LIST_SELECT, {
          count: "exact",
        })
        .neq("is_merged", true); // Hide auto-merged duplicate losers (WEB-AUTO-005)

      // Use full-text search with tsvector for better performance and relevance ranking
      if (filters.search) {
        // Full-text search with PostgreSQL tsvector (10-100x faster than ILIKE)
        // Uses websearch_to_tsquery which handles phrases, AND/OR, and quoted strings
        query = query.textSearch('search_vector', filters.search, {
          type: 'websearch',
          config: 'english'
        });
      }

      // Apply cuisine filter (array)
      if (filters.cuisine && filters.cuisine.length > 0) {
        query = query.in("cuisine", filters.cuisine);
      }

      // Apply price range filter (array)
      if (filters.priceRange && filters.priceRange.length > 0) {
        query = query.in("price_range", filters.priceRange);
      }

      // Apply rating filter
      if (filters.rating && filters.rating.length === 2) {
        query = query
          .gte("rating", filters.rating[0])
          .lte("rating", filters.rating[1]);
      }

      // Apply location filter (array) - using location column for matches
      if (filters.location && filters.location.length > 0) {
        query = query.in("location", filters.location);
      }

      // Apply featured filter
      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
      }

      // Apply dietary keyword filter (searches description and cuisine fields)
      if (filters.dietary && filters.dietary.length > 0) {
        const dietaryKeywords: Record<string, string[]> = {
          vegan: ["vegan"],
          vegetarian: ["vegetarian", "veggie"],
          "gluten-free": ["gluten free", "gluten-free", "celiac"],
          keto: ["keto", "low carb"],
          halal: ["halal"],
        };
        const orClauses = filters.dietary.flatMap((diet) => {
          const keywords = dietaryKeywords[diet] || [diet];
          return keywords.flatMap((kw) => [
            `description.ilike.%${kw}%`,
            `cuisine.ilike.%${kw}%`,
            `name.ilike.%${kw}%`,
          ]);
        });
        query = query.or(orClauses.join(","));
      }

      // Apply sorting with AI-based popularity as default
      // (sortBy already declared above for the rotation RPC branch)
      switch (sortBy) {
        case "popularity":
          // AI-based popularity: use calculated popularity_score
          query = query
            .order("popularity_score", { ascending: false })
            .order("is_featured", { ascending: false })
            .order("created_at", { ascending: false });
          break;
        case "rating":
          query = query
            .order("rating", { ascending: false, nullsFirst: false })
            .order("popularity_score", { ascending: false });
          break;
        case "newest":
          query = query.order("created_at", { ascending: false });
          break;
        case "alphabetical":
          query = query.order("name", { ascending: true });
          break;
        case "price_low":
          // Custom price sorting logic ($ < $$ < $$$ < $$$$)
          query = query
            .order("price_range", { ascending: true, nullsFirst: false })
            .order("popularity_score", { ascending: false });
          break;
        case "price_high":
          query = query
            .order("price_range", { ascending: false, nullsFirst: false })
            .order("popularity_score", { ascending: false });
          break;
        default:
          query = query.order("popularity_score", { ascending: false });
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

      // .returns<Restaurant[]>() keeps the full Row type for consumers even
      // though the select string is a runtime-projected column list (no `any`).
      let { data, error, count } = await query.returns<Restaurant[]>();

      if (error) {
        throw error;
      }

      // Fallback to fuzzy search if no results found with full-text search
      if (filters.search && (!data || data.length === 0)) {
        console.log('useRestaurants: No results with full-text search, trying fuzzy search...');
        try {
          const { data: fuzzyData, error: fuzzyError } = await supabase
            .rpc('fuzzy_search_restaurants', {
              search_query: filters.search,
              search_limit: filters.limit || 50
            });

          if (!fuzzyError && fuzzyData) {
            data = fuzzyData as unknown as Restaurant[];
            count = fuzzyData.length;
            console.log('useRestaurants: Fuzzy search found', fuzzyData.length, 'restaurants');
          }
        } catch (fuzzyErr) {
          // Fuzzy search function not available yet - silently continue
          console.log('useRestaurants: Fuzzy search not available, using existing results');
        }
      }

      setState({
        restaurants: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      console.error("Error fetching restaurants:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch restaurants",
      }));
    }
  }, [
    filters.search,
    filters.cuisine,
    filters.priceRange,
    filters.rating,
    filters.location,
    filters.sortBy,
    filters.featuredOnly,
    filters.dietary,
    filters.limit,
    filters.offset,
    filters.fullColumns,
  ]);

  const createRestaurant = async (restaurant: RestaurantInsert) => {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .insert(restaurant)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurants();
      return data;
    } catch (error) {
      console.error("Error creating restaurant:", error);
      throw error;
    }
  };

  const updateRestaurant = async (id: string, updates: RestaurantUpdate) => {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurants();
      return data;
    } catch (error) {
      console.error("Error updating restaurant:", error);
      throw error;
    }
  };

  const deleteRestaurant = async (id: string) => {
    try {
      const { error } = await supabase
        .from("restaurants")
        .delete()
        .eq("id", id);

      if (error) throw error;

      fetchRestaurants();
    } catch (error) {
      console.error("Error deleting restaurant:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  return {
    ...state,
    refetch: fetchRestaurants,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
  };
}

// Hook to get cuisine counts for "Browse by Cuisine" section.
// WEB-PERF-002: server-side aggregation via get_cuisine_counts() instead of
// fetching every restaurant's cuisine column and tallying client-side. Cached
// for 1h (filter options change rarely).
export function useCuisineCounts() {
  const { data, isLoading } = useQuery({
    queryKey: ["cuisine-counts"],
    queryFn: async (): Promise<{ cuisine: string; count: number }[]> => {
      const { data, error } = await supabase.rpc("get_cuisine_counts" as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { cuisine: string; count: number }[];
      // RPC returns bigint counts as strings via PostgREST — coerce to number.
      return rows.map((r) => ({ cuisine: r.cuisine, count: Number(r.count) }));
    },
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 2 * 60 * 60 * 1000,
  });

  return { cuisineCounts: data ?? [], isLoading };
}

// Common restaurant tags (static — not derived from the table).
const RESTAURANT_TAGS = [
  "Takeout",
  "Delivery",
  "Outdoor Seating",
  "Family Friendly",
  "Date Night",
  "Happy Hour",
];

// Utility hook to get available filter options.
// WEB-PERF-002: distinct cuisines + locations come from the
// get_restaurant_filter_options() RPC (DISTINCT computed in Postgres) instead of
// pulling every row's cuisine/location columns and deduping client-side. Cached 1h.
export function useRestaurantFilterOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["restaurant-filter-options"],
    queryFn: async (): Promise<{ cuisines: string[]; locations: string[] }> => {
      const { data, error } = await supabase.rpc(
        "get_restaurant_filter_options" as never,
      );
      if (error) throw error;
      const row = ((data ?? []) as unknown as {
        cuisines: string[] | null;
        locations: string[] | null;
      }[])[0];
      return {
        cuisines: (row?.cuisines ?? []).filter(Boolean),
        locations: (row?.locations ?? []).filter(Boolean),
      };
    },
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 2 * 60 * 60 * 1000,
  });

  return {
    cuisines: data?.cuisines ?? [],
    locations: data?.locations ?? [],
    tags: RESTAURANT_TAGS,
    isLoading,
  };
}
