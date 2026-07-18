import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { getRestaurantRotationSeed } from "@/lib/restaurantRotation";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME } from "@/lib/queryConfig";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useRestaurants");

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantInsert = Database["public"]["Tables"]["restaurants"]["Insert"];
type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];

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
        (!filters.dietary || filters.dietary.length === 0);

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
          logger.warn(
            'fetchRestaurants',
            'rotation RPC failed, falling back to direct query',
            { error: rpcError }
          );
        }
      }

      let query = supabase
        .from("restaurants")
        // Project only the card/list fields (WEB-PERF-009) — drops heavy
        // SEO/GEO/tsvector/geometry columns the list never renders. Count uses
        // the planner estimate ("planned") instead of forcing a full-table
        // exact count on every filter/sort.
        .select(RESTAURANT_LIST_COLUMNS, { count: "planned" })
        .neq("is_merged", true); // Hide rows merged into a duplicate (WEB-AUTO-005)

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

      let { data, error, count } = await query;

      if (error) {
        throw error;
      }

      // Fallback to fuzzy search if no results found with full-text search
      if (filters.search && (!data || data.length === 0)) {
        logger.debug('fetchRestaurants', 'No results with full-text search, trying fuzzy search', { search: filters.search });
        try {
          const { data: fuzzyData, error: fuzzyError } = await supabase
            .rpc('fuzzy_search_restaurants', {
              search_query: filters.search,
              search_limit: filters.limit || 50
            });

          if (!fuzzyError && fuzzyData) {
            data = fuzzyData as unknown as Restaurant[];
            count = fuzzyData.length;
            logger.info('fetchRestaurants', 'Fuzzy search found restaurants', { count: fuzzyData.length });
          }
        } catch (fuzzyErr) {
          // Fuzzy search function not available yet - silently continue
          logger.debug('fetchRestaurants', 'Fuzzy search not available, using existing results', { error: fuzzyErr });
        }
      }

      setState({
        restaurants: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      logger.error('fetchRestaurants', 'Error fetching restaurants', { error });
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
      logger.error('createRestaurant', 'Error creating restaurant', { error });
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
      logger.error('updateRestaurant', 'Error updating restaurant', { error });
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
      logger.error('deleteRestaurant', 'Error deleting restaurant', { error });
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

// ── Restaurant filter options (WEB-PERF-002) ────────────────────────────────
// Distinct cuisines (with counts) + locations come from a server-side RPC
// (get_restaurant_filter_options) instead of fetching whole columns to dedupe
// in JS. Cached client-side for an hour (REFERENCE). Falls back to the legacy
// client-side scan if the RPC isn't deployed yet.

const RESTAURANT_TAGS = [
  "Takeout",
  "Delivery",
  "Outdoor Seating",
  "Family Friendly",
  "Date Night",
  "Happy Hour",
];

interface FilterOptionsResult {
  cuisines: { cuisine: string; count: number }[];
  locations: string[];
}

async function fetchFilterOptionsRpc(): Promise<FilterOptionsResult | null> {
  // get_restaurant_filter_options is added in a new migration and isn't in the
  // generated Database types yet.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string
    ) => Promise<{ data: FilterOptionsResult | null; error: { message: string } | null }>
  )("get_restaurant_filter_options");
  if (error || !data) return null;
  return data;
}

async function fetchFilterOptionsFallback(): Promise<FilterOptionsResult> {
  const { data: cuisineData } = await supabase
    .from("restaurants")
    .select("cuisine")
    .not("cuisine", "is", null);
  const { data: locationData } = await supabase
    .from("restaurants")
    .select("location")
    .not("location", "is", null);

  const counts: Record<string, number> = {};
  cuisineData?.forEach((r) => {
    if (r.cuisine) counts[r.cuisine] = (counts[r.cuisine] || 0) + 1;
  });
  const cuisines = Object.entries(counts)
    .map(([cuisine, count]) => ({ cuisine, count }))
    .sort((a, b) => b.count - a.count);
  const locations = (
    [...new Set(locationData?.map((r) => r.location).filter(Boolean))] as string[]
  ).sort();

  return { cuisines, locations };
}

async function getRestaurantFilterOptions(): Promise<FilterOptionsResult> {
  return (await fetchFilterOptionsRpc()) ?? (await fetchFilterOptionsFallback());
}

/**
 * Cached cuisine/location facets for consumers outside the hook layer
 * (SearchSection's subcategory list, WEB-PERF-002).
 *
 * This export was missing while SearchSection imported it, which crashed the
 * homepage into the route error boundary — a missing named export is an
 * `undefined` binding once bundled (React error #130). See WEB-QA-001/003.
 */
export async function fetchRestaurantFilterFacets(): Promise<FilterOptionsResult> {
  return getRestaurantFilterOptions();
}

// Hook to get cuisine counts for "Browse by Cuisine" section
export function useCuisineCounts() {
  const { data, isLoading } = useQuery({
    queryKey: ["restaurant-filter-options"],
    queryFn: getRestaurantFilterOptions,
    staleTime: STALE_TIME.REFERENCE,
  });
  return { cuisineCounts: data?.cuisines ?? [], isLoading };
}

// Utility hook to get available filter options
export function useRestaurantFilterOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ["restaurant-filter-options"],
    queryFn: getRestaurantFilterOptions,
    staleTime: STALE_TIME.REFERENCE,
  });
  return {
    cuisines: (data?.cuisines ?? []).map((c) => c.cuisine),
    locations: data?.locations ?? [],
    tags: RESTAURANT_TAGS,
    isLoading,
  };
}
