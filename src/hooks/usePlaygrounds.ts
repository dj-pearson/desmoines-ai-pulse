import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';

const log = createLogger('usePlaygrounds');

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
  limit?: number;
  offset?: number;
}

export function usePlaygrounds(filters: PlaygroundFilters = {}) {
  const [state, setState] = useState<PlaygroundsState>({
    playgrounds: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchPlaygrounds = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("playgrounds")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,location.ilike.%${filters.search}%,age_range.ilike.%${filters.search}%`
        );
      }

      if (filters.age_range) {
        query = query.eq("age_range", filters.age_range);
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
        playgrounds: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      log.error("Error fetching playgrounds", { action: 'fetchPlaygrounds', metadata: { error } });
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch playgrounds",
      }));
    }
  };

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
      log.error("Error creating playground", { action: 'createPlayground', metadata: { error } });
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
      log.error("Error updating playground", { action: 'updatePlayground', metadata: { error } });
      throw error;
    }
  };

  const deletePlayground = async (id: string) => {
    try {
      const { error } = await supabase.from("playgrounds").delete().eq("id", id);

      if (error) throw error;

      fetchPlaygrounds();
    } catch (error) {
      log.error("Error deleting playground", { action: 'deletePlayground', metadata: { error } });
      throw error;
    }
  };

  useEffect(() => {
    fetchPlaygrounds();
  }, [filters.search, filters.age_range, filters.limit, filters.offset]);

  return {
    ...state,
    refetch: fetchPlaygrounds,
    createPlayground,
    updatePlayground,
    deletePlayground,
  };
}