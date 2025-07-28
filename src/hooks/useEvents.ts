import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

interface EventsState {
  events: Event[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface EventFilters {
  status?: "all" | "featured" | "enhanced" | "pending";
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function useEvents(filters: EventFilters = {}) {
  const [state, setState] = useState<EventsState>({
    events: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchEvents = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("events")
        .select("*", { count: "exact" })
        .order("date", { ascending: true }); // Sort by event date, not created_at

      // Apply filters
      if (filters.status && filters.status !== "all") {
        switch (filters.status) {
          case "featured":
            query = query.eq("is_featured", true);
            break;
          case "enhanced":
            query = query.eq("is_enhanced", true);
            break;
          case "pending":
            query = query.eq("is_enhanced", false);
            break;
        }
      }

      if (filters.category) {
        query = query.eq("category", filters.category);
      }

      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,venue.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
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
        events: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch events",
      }));
    }
  };

  const createEvent = async (event: EventInsert) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .insert(event)
        .select()
        .single();

      if (error) throw error;

      // Refresh events list
      fetchEvents();
      return data;
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  };

  const updateEvent = async (id: string, updates: EventUpdate) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Refresh events list
      fetchEvents();
      return data;
    } catch (error) {
      console.error("Error updating event:", error);
      throw error;
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      const { error } = await supabase.from("events").delete().eq("id", id);

      if (error) throw error;

      // Refresh events list
      fetchEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
      throw error;
    }
  };

  const toggleEventFeatured = async (id: string, isFeatured: boolean) => {
    return updateEvent(id, { is_featured: isFeatured });
  };

  const toggleEventEnhanced = async (id: string, isEnhanced: boolean) => {
    return updateEvent(id, { is_enhanced: isEnhanced });
  };

  useEffect(() => {
    fetchEvents();
  }, [
    filters.status,
    filters.category,
    filters.search,
    filters.limit,
    filters.offset,
  ]);

  return {
    ...state,
    refetch: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleEventFeatured,
    toggleEventEnhanced,
  };
}
