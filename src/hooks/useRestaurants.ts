import { useState, useEffect } from "react";
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
  cuisine?: string;
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

  const fetchRestaurants = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("restaurants")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,cuisine.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }

      if (filters.cuisine) {
        query = query.eq("cuisine", filters.cuisine);
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
          error instanceof Error ? error.message : "Failed to fetch restaurants",
      }));
    }
  };

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
      const { error } = await supabase.from("restaurants").delete().eq("id", id);

      if (error) throw error;

      fetchRestaurants();
    } catch (error) {
      console.error("Error deleting restaurant:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, [filters.search, filters.cuisine, filters.limit, filters.offset]);

  return {
    ...state,
    refetch: fetchRestaurants,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
  };
}