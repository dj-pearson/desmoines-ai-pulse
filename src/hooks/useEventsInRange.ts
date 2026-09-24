import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys, CACHE_TIERS } from "@/lib/queryKeys";
import { applyEventVisibility } from "@/lib/eventQuery";
import { addCentralDays, centralDateOf, centralWindow, type CentralDate, type CentralWindow } from "@/lib/timezone";
import { isDateOnly } from "@/lib/dateOnly";
import { ongoingStartFilter, type LandingEvent } from "@/hooks/useEventLanding";

/** Rows per window. A long window shows the first 100 and says so. */
export const EVENTS_IN_RANGE_LIMIT = 100;

export interface EventDayGroup {
  /** Central calendar date, yyyy-MM-dd. */
  day: CentralDate;
  events: LandingEvent[];
}

/**
 * Events on the Central days `from` through `to`, both inclusive, grouped by
 * Central day (plan-stay WP1 item 5). Same visibility predicate and column
 * set as the event landings, so a card here never dead-ends on a hidden or
 * merged row. Disabled until both dates are real yyyy-MM-dd strings.
 */
export function useEventsInRange(from: string | null, to: string | null) {
  const valid = isDateOnly(from) && isDateOnly(to);
  const window: CentralWindow | null = useMemo(
    () => (valid ? centralWindow({ kind: "range", from: from!, to: to! }) : null),
    [valid, from, to],
  );

  const query = useQuery({
    queryKey: queryKeys.events.list({
      landing: "trip-window",
      from: window?.start ?? null,
      to: window?.end ?? null,
      limit: EVENTS_IN_RANGE_LIMIT,
    }),
    queryFn: async (): Promise<LandingEvent[]> => {
      if (!window) return [];
      // Starts in the window, or started earlier and is still running at its
      // start: a festival that opened the day before you arrive is on during
      // your trip (same rule as the weekend landing's includeOngoing).
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS),
      )
        .or(ongoingStartFilter(window.start))
        .lte("date", window.end)
        .order("date", { ascending: true })
        .limit(EVENTS_IN_RANGE_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as LandingEvent[];
    },
    enabled: !!window,
    ...CACHE_TIERS.standard,
  });

  const days = useMemo(
    () => (window ? groupByCentralDay(query.data ?? [], window) : []),
    [query.data, window],
  );

  return { ...query, window, days };
}

/**
 * One group per Central day in the window, in order, including days with no
 * events (so "nothing listed Saturday" is visible rather than a missing day).
 * An event that started before the window and is still running at its
 * start is listed on the first day. Any other row outside the window is
 * dropped rather than filed under the wrong day.
 */
export function groupByCentralDay(events: LandingEvent[], window: CentralWindow): EventDayGroup[] {
  const groups = new Map<CentralDate, LandingEvent[]>();
  let day = window.startDay;
  // Bounded: a window is at most a few weeks, but never loop forever on bad input.
  for (let i = 0; i < 400 && day <= window.endDay; i++) {
    groups.set(day, []);
    day = addCentralDays(day, 1);
  }
  for (const event of events) {
    if (!event.date) continue;
    let key = centralDateOf(event.date);
    // Still running when the window opens: list it on the first day.
    if (key < window.startDay && event.end_date && centralDateOf(event.end_date) >= window.startDay) {
      key = window.startDay;
    }
    groups.get(key)?.push(event);
  }
  return [...groups.entries()].map(([d, list]) => ({ day: d, events: list }));
}
