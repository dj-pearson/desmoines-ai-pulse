import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { createLogger } from "@/lib/logger";
import { STALE_TIME, GC_TIME, shouldRetry } from "@/lib/queryConfig";
import { Database } from "@/integrations/supabase/types";

const logger = createLogger("useEvents");

type Event = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

/** Stable empty array. Returning a fresh `[]` literal on every render gives
 *  `events` a new identity each time, which re-fires any consumer useEffect that
 *  depends on it and produced a "Maximum update depth exceeded" render loop in
 *  SmartEventNavigation. Must stay module-level. */
const EMPTY_EVENTS: Event[] = [];

/** Payload the query resolves to; the hook flattens it into its public shape. */
interface EventsResult {
  events: Event[];
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

/**
 * Standalone fetcher so TanStack Query owns caching, dedup and retries
 * (WEB-PERF-013).
 *
 * This hook previously drove a manual useState/useEffect cycle, so every
 * mounted consumer issued its own request for the same filters, nothing was
 * cached across navigations, and a filter change could leave an in-flight
 * response from the previous filters to land last and win.
 */
async function fetchEvents(filters: EventFilters): Promise<EventsResult> {
  const today = new Date().toISOString().split('T')[0];
  logger.info('fetchEvents', 'Fetching events', { from: today });

  // Apply sort. "soonest" is the legacy default (date ASC); "featured"
  // pushes is_featured rows up; "popularity" uses popularity_score added
  // by migration 20260506000008. NULLS go last so events with no score
  // don't crowd out scored ones.
  const sortBy: EventSortBy = filters.sortBy ?? "soonest";
  let query = supabase
    .from("events")
    .select(EVENT_LIST_COLUMNS, { count: "exact" })
    .gte("date", today) // Only today and future events
    .neq("is_merged", true) // Hide rows merged into a duplicate (WEB-AUTO-005)
    .neq("is_hidden", true); // Hide soft-hidden stale events (WEB-AUTO-006)
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
    // Surface the PostgREST fields explicitly. Logging the bare object rendered
    // as a collapsed `Object` in production consoles, which is why a missing
    // column (42703) went undiagnosed on the homepage (WEB-QA-003).
    logger.error('fetchEvents', 'Database query error', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  // Fallback to fuzzy search if no results found with full-text search
  if (filters.search && (!data || data.length === 0)) {
    logger.debug('fetchEvents', 'No results with full-text search, trying fuzzy search', { search: filters.search });
    try {
      const { data: fuzzyData, error: fuzzyError } = await supabase
        .rpc('fuzzy_search_events', {
          search_query: filters.search,
          search_limit: filters.limit || 50
        });

      if (!fuzzyError && fuzzyData) {
        data = fuzzyData as unknown as Event[];
        count = fuzzyData.length;
        logger.info('fetchEvents', 'Fuzzy search found events', { count: fuzzyData.length });
      }
    } catch (fuzzyErr) {
      // Fuzzy search function not available yet - silently continue
      logger.debug('fetchEvents', 'Fuzzy search not available, using existing results', { error: fuzzyErr });
    }
  }

  logger.info('fetchEvents', 'Found events', { count: data?.length, from: today });

  return {
    events: data || [],
    totalCount: count || 0,
  };
}

/** Query key factory — filter changes flow through here, so a changed filter
 *  starts a new cache entry instead of racing a manual refetch effect. */
function eventsQueryKey(filters: EventFilters) {
  return [
    "events",
    {
      status: filters.status ?? null,
      category: filters.category ?? null,
      search: filters.search ?? null,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
      sortBy: filters.sortBy ?? "soonest",
    },
  ] as const;
}

export function useEvents(filters: EventFilters = {}) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: eventsQueryKey(filters),
    queryFn: () => fetchEvents(filters),
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  /** Drop cached event data after a write so lists and detail pages both
   *  reflect the change. `event-by-slug` is a separate key owned by
   *  useEventBySlug and would otherwise keep serving a stale row. */
  const invalidateEvents = () => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
    queryClient.invalidateQueries({ queryKey: ["event-by-slug"] });
  };

  const createEvent = async (event: EventInsert) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .insert(event)
        .select()
        .single();

      if (error) throw error;

      // Refresh every cached events list
      invalidateEvents();
      return data;
    } catch (error) {
      logger.error('createEvent', 'Error creating event', { error });
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

      // Refresh every cached events list
      invalidateEvents();
      return data;
    } catch (error) {
      logger.error('updateEvent', 'Error updating event', { error });
      throw error;
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      const { error } = await supabase.from("events").delete().eq("id", id);

      if (error) throw error;

      // Refresh every cached events list
      invalidateEvents();
    } catch (error) {
      logger.error('deleteEvent', 'Error deleting event', { error });
      throw error;
    }
  };

  const toggleEventFeatured = async (id: string, isFeatured: boolean) => {
    return updateEvent(id, { is_featured: isFeatured });
  };

  const toggleEventEnhanced = async (id: string, isEnhanced: boolean) => {
    return updateEvent(id, { is_enhanced: isEnhanced });
  };

  // No refetch effect: the query key above already encodes the filters, so a
  // filter change starts a new query and TanStack dedupes identical in-flight
  // keys across every consumer.
  return {
    // Public shape preserved exactly for existing consumers (WEB-PERF-013):
    // `error` stays a string | null rather than the Error object useQuery returns.
    events: data?.events ?? EMPTY_EVENTS,
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch events") : null,
    refetch,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleEventFeatured,
    toggleEventEnhanced,
  };
}
