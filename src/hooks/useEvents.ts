import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS, withAdminColumns } from "@/lib/listColumns";
import { createLogger } from "@/lib/logger";
import { STALE_TIME, GC_TIME, shouldRetry } from "@/lib/queryConfig";
import { Database } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { countOption, type CountMode } from "@/lib/listCount";
import { centralDayStartUtcISO } from "@/lib/timezone";

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
  /**
   * Ask for the admin-only columns as well (WEB-PERF-035). Only
   * /admin/content sets it: ai_writeup is a 250-350 word paragraph per row and
   * the only thing that reads it is ContentTable's "has a writeup" tick, so the
   * public lists no longer carry it.
   *
   * It is part of the query key below, or the admin table would be served the
   * public cache entry and its tick column would be blank.
   */
  includeAdminFields?: boolean;
  /**
   * How hard to work for `totalCount`; see src/lib/listCount.ts. Defaults to
   * "exact" here, unlike the other list hooks, so every existing caller keeps
   * the count it had. The home dashboard renders no total and passes "none"
   * (home plan WP3), which drops the `Prefer: count=exact` second scan.
   */
  countMode?: CountMode;
}

/**
 * Lower bound for "upcoming" event lists: midnight at the start of today's
 * CENTRAL calendar day, as a UTC instant.
 *
 * This bounded on `new Date().toISOString().split('T')[0]` - the UTC date -
 * against `events.date`, a timestamptz. Des Moines is UTC-5/-6, so until 7pm
 * CDT the bound was still yesterday's UTC midnight (last night's 8pm show was
 * listed as upcoming) and from 7pm on it jumped to tomorrow (tonight's 6pm
 * event, still in progress, vanished). Central midnight keeps every event on
 * today's Des Moines date and drops yesterday's (home plan WP3 item 3).
 */
export function eventsLowerBoundISO(): string {
  return centralDayStartUtcISO();
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
  const today = eventsLowerBoundISO();
  logger.info('fetchEvents', 'Fetching events', { from: today });

  // Apply sort. "soonest" is the legacy default (date ASC); "featured"
  // pushes is_featured rows up; "popularity" uses popularity_score added
  // by migration 20260506000008. NULLS go last so events with no score
  // don't crowd out scored ones.
  const sortBy: EventSortBy = filters.sortBy ?? "soonest";
  let query = supabase
    .from("events")
    .select(
      withAdminColumns(EVENT_LIST_COLUMNS, filters.includeAdminFields),
      countOption(filters.countMode ?? "exact")
    )
    .gte("date", today) // Today (Central) and later
    .neq("is_merged", true) // Hide rows merged into a duplicate (WEB-AUTO-005)
    .neq("is_hidden", true) // Hide soft-hidden stale events (WEB-AUTO-006)
    // WEB-BE-034. THERE ARE TWO UNPUBLISH SWITCHES ON `events` AND THIS SURFACE
    // read only one of them.
    //
    // is_hidden/hidden_at is written by hide_stale_events (WEB-AUTO-006).
    // archived_at is written by agent-link-monitor, which sweeps past events
    // and sets it -- reversibly, by design: "set archived_at back to null to
    // restore" is the documented undo, which is why a timestamp was chosen over
    // a boolean.
    //
    // The agent surfaces (link monitor, re-engagement, weekly digest,
    // lead sourcing, generate-proposal) filter `archived_at IS NULL` and never
    // touch is_hidden. Every web read filtered is_hidden and never touched
    // archived_at. So the unpublish job could run correctly and change nothing
    // a visitor or a crawler saw: the event stayed on /events, in the hubs and
    // in sitemap-events.xml.
    //
    // Both are filtered everywhere now, on all 19 event reads including the two
    // sitemap generators. They are NOT merged into one column: the two
    // mechanisms mean different things (a moderator hid this / the sweep
    // retired this) and collapsing them would lose the distinction and the
    // timestamp.
    .is("archived_at", null);
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

  // .returns<Event[]> because the projection is a RUNTIME string.
  // withAdminColumns() builds the column list from a flag, so supabase-js
  // cannot parse it into a row type and falls back to GenericStringError[] -
  // which then poisons the fuzzy-search reassignment below and the return.
  // Event[] is the type this function already declares it resolves to
  // (EventsResult), so this states the existing contract rather than widening
  // anything; EVENT_LIST_COLUMNS is what keeps it honest.
  let { data, error, count } = await query.returns<Event[]>();

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

/**
 * Query key factory - filter changes flow through here, so a changed filter
 * starts a new cache entry instead of racing a manual refetch effect.
 *
 * WEB-PERF-032: this returned ["events", {...}], one level above the shared
 * factory's lists(). That put it on the same rung as the featured rail, so
 * nothing could invalidate "every list" without also invalidating the rail.
 * It goes through queryKeys.events.list now, which is ["events","list",{...}].
 * The filter object is still spelled out field by field rather than passed
 * through: `{}` and `{ category: undefined }` must produce the SAME key, and
 * spreading the caller's object would give two cache entries for one query.
 */
export function eventsQueryKey(filters: EventFilters) {
  return queryKeys.events.list({
    status: filters.status ?? null,
    category: filters.category ?? null,
    search: filters.search ?? null,
    limit: filters.limit ?? null,
    offset: filters.offset ?? null,
    sortBy: filters.sortBy ?? "soonest",
    includeAdminFields: filters.includeAdminFields ?? false,
    countMode: filters.countMode ?? "exact",
  });
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

  /**
   * Drop cached event data after a write so lists and detail pages both
   * reflect the change. `event-by-slug` is a separate key owned by
   * useEventBySlug and would otherwise keep serving a stale row.
   *
   * WEB-PERF-032: this invalidated the bare ["events"], which is the parent of
   * the homepage's featured rail as well as of every list - so editing one
   * queued event refetched the rail on every open tab. It now invalidates
   * lists() and details() and leaves featured alone unless the write actually
   * moved is_featured or is_sponsored, which are the only two columns the rail
   * selects on.
   */
  const invalidateEvents = (opts: { featured?: boolean } = {}) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.events.details() });
    queryClient.invalidateQueries({ queryKey: ["event-by-slug"] });
    if (opts.featured) {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.featuredAll() });
    }
  };

  /** True when an update touches a column the featured rail selects on. */
  const touchesFeatured = (updates: EventUpdate | EventInsert) =>
    "is_featured" in updates || "is_sponsored" in updates;

  const createEvent = async (event: EventInsert) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .insert(event)
        .select()
        .single();

      if (error) throw error;

      // A new row can qualify for the rail, so refresh it unconditionally here.
      invalidateEvents({ featured: true });
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

      invalidateEvents({ featured: touchesFeatured(updates) });
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

      // A deleted row may have been ON the rail, and nothing here knows whether
      // it was, so this one always refreshes it.
      invalidateEvents({ featured: true });
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
