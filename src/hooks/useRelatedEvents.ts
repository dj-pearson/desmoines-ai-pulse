/**
 * The two event rails under event detail (events plan WP8 item 7).
 *
 * They used to be carved out of useEvents({ limit: 50 }): the 50 soonest
 * events site-wide, filtered in the browser. A category with nothing in the
 * next 50 rows showed no rail even with a dozen matches next month, and the
 * request fired before the page knew which event it was on. Each rail is now
 * its own bounded query that waits for the event to resolve.
 *
 *   - useRelatedEvents: same category, upcoming, this event excluded, 4 rows,
 *     no count.
 *   - useSameNightNearby: same Central date, within NEARBY_MILES of the venue.
 *     Needs coordinates; without them the query never runs. Bounded from
 *     max(now, start - 3h) to the end of that Central day, over rows dropped
 *     (events-pass2 WP4 item 14).
 *   - useEventSeries: the other upcoming dates of the same event, by
 *     recurrence_parent_id, else by exact title (events-pass2 WP4 item 13).
 *
 * A new hook rather than an `enabled` flag on useEvents, which home WP3 owns.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { applyEventVisibility } from "@/lib/eventQuery";
import { STALE_TIME } from "@/lib/queryConfig";
import { centralWindow, upcomingFloorUtc } from "@/lib/timezone";
import { eventCentralDate, eventStart, isEventOver, type EventTimingInput } from "@/lib/eventTiming";
import { nearby, NEARBY_MILES } from "@/lib/venuePages";
import type { Event } from "@/lib/types";

export const RELATED_EVENTS_LIMIT = 4;
export const SAME_NIGHT_LIMIT = 3;

/** Degrees that cover NEARBY_MILES at Des Moines' latitude (41.6N). */
const LAT_PAD = NEARBY_MILES / 69;
const LNG_PAD = NEARBY_MILES / 51.6;

/** Rows scanned before the distance cut. */
const SAME_NIGHT_SCAN = 40;

/** How far before this event's start the same-night rail looks. */
const SAME_NIGHT_LEAD_MS = 3 * 60 * 60 * 1000;

/** The lower bound moves in 15-minute steps so the query key doesn't churn. */
const BOUND_STEP_MS = 15 * 60 * 1000;

export const SERIES_LIMIT = 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_EVENTS: Event[] = [];

export interface RelatedEventsSource extends EventTimingInput {
  id: string;
  category?: string | null;
}

export function useRelatedEvents(event: RelatedEventsSource | null | undefined) {
  const id = event?.id;
  const category = event?.category?.trim() || null;

  const query = useQuery({
    queryKey: ["event-related", id, category],
    enabled: Boolean(id && category),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      )
        .eq("category", category as string)
        .neq("id", id as string)
        .gte("date", upcomingFloorUtc())
        .order("date", { ascending: true })
        .limit(RELATED_EVENTS_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
  });

  return { events: query.data ?? NO_EVENTS, isLoading: query.isLoading, error: query.error };
}

export function useSameNightNearby(
  event: RelatedEventsSource | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  now: Date = new Date(),
) {
  const id = event?.id;
  const day = event ? eventCentralDate(event) : null;
  const start = event ? eventStart(event) : null;
  const located =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);

  // max(now, start - 3h): a rail of things that already started is advice
  // nobody can take. Floored to 15 minutes so the key is stable for a while.
  const from = start
    ? Math.floor(Math.max(now.getTime(), start.getTime() - SAME_NIGHT_LEAD_MS) / BOUND_STEP_MS) * BOUND_STEP_MS
    : null;

  const query = useQuery({
    queryKey: [
      "event-same-night",
      id,
      day,
      from,
      located ? latitude.toFixed(3) : null,
      located ? longitude.toFixed(3) : null,
    ],
    enabled: Boolean(id && day && located && from !== null),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const window = centralWindow({ kind: "single", date: day as string });
      const lower = new Date(Math.max(from as number, Date.parse(window.start))).toISOString();
      const lat = latitude as number;
      const lng = longitude as number;
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      )
        .neq("id", id as string)
        .gte("date", lower)
        .lte("date", window.end)
        .gte("latitude", lat - LAT_PAD)
        .lte("latitude", lat + LAT_PAD)
        .gte("longitude", lng - LNG_PAD)
        .lte("longitude", lng + LNG_PAD)
        .order("date", { ascending: true })
        .limit(SAME_NIGHT_SCAN);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
    select: (rows) =>
      nearby(
        { latitude, longitude },
        rows.filter((row) => !isEventOver(row, now)),
        { maxMiles: NEARBY_MILES, limit: SAME_NIGHT_LIMIT },
      ),
  });

  return { events: query.data ?? [], isLoading: query.isLoading && query.fetchStatus !== "idle" };
}

export interface SeriesSource extends RelatedEventsSource {
  title?: string | null;
  recurrence_parent_id?: string | null;
}

/**
 * The other upcoming dates of this event, soonest first, up to SERIES_LIMIT.
 *
 * With recurrence_parent_id set, the series is the parent and its instances:
 * `or(recurrence_parent_id.eq.P,id.eq.P)`. The column is in
 * scripts/db-snapshot.json and in EVENT_DETAIL_COLUMNS. When that finds
 * nothing, or the row has no parent, it falls back to the exact title, which
 * is how most scraped runs are linked today. A past event's page uses the
 * first row as "Next date".
 */
export function useEventSeries(event: SeriesSource | null | undefined) {
  const id = event?.id;
  const title = event?.title?.trim() || null;
  // Interpolated into an or() filter, so only ever a UUID.
  const parentId =
    event?.recurrence_parent_id && UUID_RE.test(event.recurrence_parent_id) ? event.recurrence_parent_id : null;

  const query = useQuery({
    queryKey: ["event-series", id, parentId, title],
    enabled: Boolean(id && (parentId || title)),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const upcoming = () =>
        applyEventVisibility(supabase.from("events").select(EVENT_LIST_COLUMNS))
          .neq("id", id as string)
          .gte("date", upcomingFloorUtc())
          .order("date", { ascending: true })
          .limit(SERIES_LIMIT);

      if (parentId) {
        const { data, error } = await upcoming().or(
          `recurrence_parent_id.eq.${parentId},id.eq.${parentId}`
        );
        if (error) throw error;
        if (data && data.length > 0) return data as unknown as Event[];
      }
      if (!title) return NO_EVENTS;
      const { data, error } = await upcoming().eq("title", title);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
  });

  return { events: query.data ?? NO_EVENTS, isLoading: query.isLoading && query.fetchStatus !== "idle" };
}
