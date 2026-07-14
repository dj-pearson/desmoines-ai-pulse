import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";

const logger = createLogger("useEvents");

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
        logger.error('fetchEvents', 'Database query error', { error });
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

      setState({
        events: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      logger.error('fetchEvents', 'Error fetching events', { error });
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

      // Refresh events list
      fetchEvents();
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

      // Refresh events list
      fetchEvents();
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

interface EventBySlugState {
  event: Event | null;
  isLoading: boolean;
  notFound: boolean;
}

/**
 * Resolve a single event from its URL slug (WEB-QA-002).
 *
 * Event detail slugs are `${slugify(title)}-YYYY-MM-DD` (Central-time date, see
 * createEventSlugWithCentralTime). Detail pages used to resolve an event by
 * scanning the full `useEvents()` list and `.find()`-ing the slug — but that
 * list is un-paginated and therefore capped at PostgREST's ~1000-row default
 * (ordered by date ASC). Any event beyond that cap (e.g. a few months out)
 * was absent from the array, so a card that appeared in a narrower filtered
 * listing 404'd as "Event Not Found" on its detail page.
 *
 * This resolves the event with a tight date-window query using the SAME
 * visibility predicates as the list (`is_merged`/`is_hidden`), so any listed
 * event always resolves regardless of how far out it is. Full row (`*`) so the
 * detail page gets the SEO/GEO columns the list projection drops.
 */
export function useEventBySlug(slug: string | undefined) {
  const [state, setState] = useState<EventBySlugState>({
    event: null,
    isLoading: true,
    notFound: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      setState({ event: null, isLoading: false, notFound: true });
      return;
    }

    const resolve = async () => {
      setState((prev) => ({ ...prev, isLoading: true, notFound: false }));
      try {
        let query = supabase
          .from("events")
          .select("*")
          .neq("is_merged", true)
          .neq("is_hidden", true);

        // Bound the query by the date embedded in the slug so the result set
        // stays small and cap-proof. ±2 days absorbs any Central/UTC boundary
        // drift between the slug's date and the stored `date` column.
        const dateMatch = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const [, y, m, d] = dateMatch;
          const target = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
          const iso = (dt: Date) => dt.toISOString().split("T")[0];
          const from = new Date(target);
          from.setUTCDate(from.getUTCDate() - 2);
          const to = new Date(target);
          to.setUTCDate(to.getUTCDate() + 2);
          query = query.gte("date", iso(from)).lte("date", iso(to));
        } else {
          // Legacy title-only slug (dateless event): bounded fallback scan.
          query = query.limit(1000);
        }

        const { data, error } = await query;
        if (error) throw error;

        const match =
          (data as Event[] | null)?.find(
            (e) => createEventSlugWithCentralTime(e.title, e) === slug,
          ) ?? null;

        if (!cancelled) {
          setState({ event: match, isLoading: false, notFound: !match });
        }
      } catch (error) {
        logger.error("useEventBySlug", "Error resolving event by slug", {
          error,
        });
        if (!cancelled) {
          setState({ event: null, isLoading: false, notFound: true });
        }
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
