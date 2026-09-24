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
 *     Needs coordinates; without them the query never runs.
 *
 * A new hook rather than an `enabled` flag on useEvents, which home WP3 owns.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { applyEventVisibility } from "@/lib/eventQuery";
import { STALE_TIME } from "@/lib/queryConfig";
import { centralWindow, upcomingFloorUtc } from "@/lib/timezone";
import { eventCentralDate, type EventTimingInput } from "@/lib/eventTiming";
import { nearby, NEARBY_MILES } from "@/lib/venuePages";
import type { Event } from "@/lib/types";

export const RELATED_EVENTS_LIMIT = 4;
export const SAME_NIGHT_LIMIT = 3;

/** Degrees that cover NEARBY_MILES at Des Moines' latitude (41.6N). */
const LAT_PAD = NEARBY_MILES / 69;
const LNG_PAD = NEARBY_MILES / 51.6;

/** Rows scanned before the distance cut. */
const SAME_NIGHT_SCAN = 40;

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
) {
  const id = event?.id;
  const day = event ? eventCentralDate(event) : null;
  const located =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);

  const query = useQuery({
    queryKey: [
      "event-same-night",
      id,
      day,
      located ? latitude.toFixed(3) : null,
      located ? longitude.toFixed(3) : null,
    ],
    enabled: Boolean(id && day && located),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const window = centralWindow({ kind: "single", date: day as string });
      const lat = latitude as number;
      const lng = longitude as number;
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      )
        .neq("id", id as string)
        .gte("date", window.start)
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
      nearby({ latitude, longitude }, rows, { maxMiles: NEARBY_MILES, limit: SAME_NIGHT_LIMIT }),
  });

  return { events: query.data ?? [], isLoading: query.isLoading && query.fetchStatus !== "idle" };
}

/**
 * The next upcoming row with the same title, for a past event's page (events
 * plan WP8 item 12). Only runs when `enabled`, which the page sets once the
 * event is over. recurrence_parent_id is not used: nothing reads that column
 * today and production has not been probed for it.
 */
export function useNextOccurrence(event: RelatedEventsSource & { title?: string | null } | null | undefined, enabled: boolean) {
  const id = event?.id;
  const title = event?.title?.trim() || null;

  const query = useQuery({
    queryKey: ["event-next-occurrence", id, title],
    enabled: Boolean(enabled && id && title),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      )
        .eq("title", title as string)
        .neq("id", id as string)
        .gte("date", upcomingFloorUtc())
        .order("date", { ascending: true })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as unknown as Event | undefined) ?? null;
    },
  });

  return query.data ?? null;
}
