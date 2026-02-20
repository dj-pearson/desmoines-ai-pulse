import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';

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
  limit?: number;
  offset?: number;
}

export function useAttractions(filters: AttractionFilters = {}) {
  const [state, setState] = useState<AttractionsState>({
    attractions: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchAttractions = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("attractions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

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
        attractions: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      log.error('fetchAttractions', 'Error fetching attractions', { error });
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch attractions",
      }));
    }
  };

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

  useEffect(() => {
    fetchAttractions();
  }, [filters.search, filters.type, filters.minRating, filters.featuredOnly, filters.limit, filters.offset]);

  return {
    ...state,
    refetch: fetchAttractions,
    createAttraction,
    updateAttraction,
    deleteAttraction,
  };
}