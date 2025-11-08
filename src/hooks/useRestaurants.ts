import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

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

      let query = supabase.from("restaurants").select("*", { count: "exact" });

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

      // Apply sorting with AI-based popularity as default
      const sortBy = filters.sortBy || "popularity";
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

// Utility hook to get available filter options
export function useRestaurantFilterOptions() {
  const [options, setOptions] = useState({
    cuisines: [] as string[],
    locations: [] as string[],
    tags: [] as string[],
    isLoading: true,
  });

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        // Get unique cuisines
        const { data: cuisineData } = await supabase
          .from("restaurants")
          .select("cuisine")
          .not("cuisine", "is", null);

        // Get unique locations from the location column
        const { data: locationData } = await supabase
          .from("restaurants")
          .select("location")
          .not("location", "is", null);

        const uniqueCuisines = [
          ...new Set(cuisineData?.map((r) => r.cuisine).filter(Boolean)),
        ] as string[];

        // Use the location column for location filtering
        const uniqueLocations = [
          ...new Set(locationData?.map((r) => r.location).filter(Boolean)),
        ] as string[];

        setOptions({
          cuisines: uniqueCuisines.sort(),
          locations: uniqueLocations.sort(),
          tags: [
            "Takeout",
            "Delivery",
            "Outdoor Seating",
            "Family Friendly",
            "Date Night",
            "Happy Hour",
          ], // Common restaurant tags
          isLoading: false,
        });
      } catch (error) {
        console.error("Error fetching filter options:", error);
        setOptions((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchFilterOptions();
  }, []);

  return options;
}
