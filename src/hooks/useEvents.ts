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

export type EventSortBy = "soonest" | "featured" | "popularity";

interface EventFilters {
  status?: "all" | "featured" | "enhanced" | "pending";
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  /** Web parity for IOS-DISCOVER-2026-003 — defaults to "soonest". */
  sortBy?: EventSortBy;
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

      const today = new Date().toISOString().split('T')[0];
      console.log('useEvents: Fetching events for date >=', today);

      // Apply sort. "soonest" is the legacy default (date ASC); "featured"
      // pushes is_featured rows up; "popularity" uses popularity_score added
      // by migration 20260506000008. NULLS go last so events with no score
      // don't crowd out scored ones.
      const sortBy: EventSortBy = filters.sortBy ?? "soonest";
      let query = supabase
        .from("events")
        .select("*", { count: "exact" })
        .gte("date", today) // Only today and future events
        .neq("is_merged", true); // Hide rows merged into a duplicate (WEB-AUTO-005)
      if (sortBy === "featured") {
        query = query
          .order("is_featured", { ascending: false })
          .order("date", { ascending: true });
      } else if (sortBy === "popularity") {
        query = query
          .order("popularity_score", { ascending: false, nullsFirst: false })
          .order("date", { ascending: true });
      } else {
        query = query.order("date", { ascending: true });
      }

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

      // Use full-text search with tsvector for better performance and relevance ranking
      if (filters.search) {
        // Full-text search with PostgreSQL tsvector (10-100x faster than ILIKE)
        // Uses websearch_to_tsquery which handles phrases, AND/OR, and quoted strings
        query = query.textSearch('search_vector', filters.search, {
          type: 'websearch',
          config: 'english'
        });
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
        console.error("useEvents: Database query error:", error);
        throw error;
      }

      // Fallback to fuzzy search if no results found with full-text search
      if (filters.search && (!data || data.length === 0)) {
        console.log('useEvents: No results with full-text search, trying fuzzy search...');
        try {
          const { data: fuzzyData, error: fuzzyError } = await supabase
            .rpc('fuzzy_search_events', {
              search_query: filters.search,
              search_limit: filters.limit || 50
            });

          if (!fuzzyError && fuzzyData) {
            data = fuzzyData as unknown as Event[];
            count = fuzzyData.length;
            console.log('useEvents: Fuzzy search found', fuzzyData.length, 'events');
          }
        } catch (fuzzyErr) {
          // Fuzzy search function not available yet - silently continue
          console.log('useEvents: Fuzzy search not available, using existing results');
        }
      }

      console.log('useEvents: Found', data?.length, 'events from', today, 'onwards');

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
    filters.sortBy,
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
