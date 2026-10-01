import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

// `openingTimeframe` IS A READ-SIDE ALIAS AND BELONGS ONLY ON THE ROW. The
// column is `opening_timeframe`; the camelCase name is produced by
// useSupabase.ts:199 for RestaurantOpenings.tsx and AllInclusiveDashboard.tsx
// to render. It was intersected onto Insert and Update too, so the write
// helpers below advertised a field PostgREST would reject with PGRST204 -
// nothing sent one, but nothing stopped it either. supabase-js 2.85+ rejects
// excess properties on insert/update, which is what surfaced it.
type RestaurantOpening = Database["public"]["Tables"]["restaurant_openings"]["Row"] & {
  openingTimeframe?: string;
};
type RestaurantOpeningInsert = Database["public"]["Tables"]["restaurant_openings"]["Insert"];
type RestaurantOpeningUpdate = Database["public"]["Tables"]["restaurant_openings"]["Update"];

interface RestaurantOpeningsState {
  restaurantOpenings: RestaurantOpening[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface RestaurantOpeningFilters {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export function useRestaurantOpenings(filters: RestaurantOpeningFilters = {}) {
  const [state, setState] = useState<RestaurantOpeningsState>({
    restaurantOpenings: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchRestaurantOpenings = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("restaurant_openings")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,cuisine.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }

      if (filters.status) {
        query = query.eq("status", filters.status);
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

      setState({
        restaurantOpenings: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      console.error("Error fetching restaurant openings:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch restaurant openings",
      }));
    }
  };

  const createRestaurantOpening = async (restaurantOpening: RestaurantOpeningInsert) => {
    try {
      const { data, error } = await supabase
        .from("restaurant_openings")
        .insert(restaurantOpening)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurantOpenings();
      return data;
    } catch (error) {
      console.error("Error creating restaurant opening:", error);
      throw error;
    }
  };

  const updateRestaurantOpening = async (id: string, updates: RestaurantOpeningUpdate) => {
    try {
      const { data, error } = await supabase
        .from("restaurant_openings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurantOpenings();
      return data;
    } catch (error) {
      console.error("Error updating restaurant opening:", error);
      throw error;
    }
  };

  const deleteRestaurantOpening = async (id: string) => {
    try {
      const { error } = await supabase.from("restaurant_openings").delete().eq("id", id);

      if (error) throw error;

      fetchRestaurantOpenings();
    } catch (error) {
      console.error("Error deleting restaurant opening:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchRestaurantOpenings();
  }, [filters.search, filters.status, filters.limit, filters.offset]);

  return {
    ...state,
    refetch: fetchRestaurantOpenings,
    createRestaurantOpening,
    updateRestaurantOpening,
    deleteRestaurantOpening,
  };
}